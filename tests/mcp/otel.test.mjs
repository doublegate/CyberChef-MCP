/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * OpenTelemetry instrumentation.
 *
 * The instrumentation is API-only: this server never registers an SDK, so the default state under
 * test is "nothing is recording". That makes two things worth asserting that a normal telemetry
 * suite would not:
 *
 *   - it must be genuinely FREE when nothing is listening, because the default deployment is a
 *     stdio subprocess with no collector and never will have one;
 *   - it must be CORRECT when something is, which is verified here against a hand-written fake
 *     TracerProvider rather than by pulling in the SDK the module exists to avoid.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import {
    trace, metrics, context, SpanStatusCode, ROOT_CONTEXT, propagation
} from "@opentelemetry/api";

import {
    ATTR, withServerSpan, recordDuration, traceFields, isRecording, _resetOtelForTest,
    parentContextFrom
} from "../../src/node/lib/otel.mjs";

/**
 * A minimal recording TracerProvider built on the API's own interfaces.
 *
 * Deliberately not `@opentelemetry/sdk-trace-node`: this module's entire design claim is that the
 * SDK is not a dependency, and a test suite that installs it to check the claim has quietly made
 * it false -- the package would appear in the lockfile and in every audit of what this project
 * pulls in.
 */
function fakeTracerProvider(recorded) {
    const makeSpan = (name, options) => {
        const span = {
            name,
            attributes: { ...(options?.attributes || {}) },
            kind: options?.kind,
            status: undefined,
            ended: false,
            _ctx: { traceId: "0af7651916cd43dd8448eb211c80319c",
                spanId: "b7ad6b7169203331", traceFlags: 1 },
            setAttribute(k, v) {
                this.attributes[k] = v; return this;
            },
            setAttributes(a) {
                Object.assign(this.attributes, a); return this;
            },
            setStatus(s) {
                this.status = s; return this;
            },
            recordException() {
                return this;
            },
            addEvent() {
                return this;
            },
            updateName(n) {
                this.name = n; return this;
            },
            end() {
                this.ended = true;
            },
            isRecording() {
                return !this.ended;
            },
            spanContext() {
                return this._ctx;
            }
        };
        recorded.spans.push(span);
        return span;
    };
    return { getTracer: () => ({ startSpan: makeSpan, startActiveSpan: (n, o, f) => f(makeSpan(n, o)) }) };
}

/** A meter provider that records every histogram observation. */
function fakeMeterProvider(recorded) {
    return {
        getMeter: () => ({
            createHistogram: (name, opts) => ({
                record(value, attributes) {
                    recorded.measurements.push({ name, unit: opts?.unit, value, attributes });
                }
            }),
            createCounter: () => ({ add() {} }),
            createUpDownCounter: () => ({ add() {} }),
            createObservableGauge: () => ({ addCallback() {} })
        })
    };
}

/**
 * A context manager backed by AsyncLocalStorage.
 *
 * Needed because the API's DEFAULT manager is a no-op that does not propagate: `context.with()`
 * calls the function but stores nothing, so `trace.getActiveSpan()` returns undefined and log
 * correlation silently produces no fields. Discovered by this suite failing on exactly that.
 *
 * That is not a defect in the instrumentation -- with no SDK there are no traces to correlate to
 * anyway, and every real SDK registers AsyncLocalStorageContextManager. But it does mean
 * correlation is a property of the SDK being present, not of this module alone, so the fake has to
 * supply one for the assertion to mean anything.
 */
function fakeContextManager() {
    const als = new AsyncLocalStorage();
    return {
        active: () => als.getStore() ?? ROOT_CONTEXT,
        with(ctx, fn, thisArg, ...args) {
            return als.run(ctx, () => fn.call(thisArg, ...args));
        },
        bind(ctx, target) {
            return target;
        },
        enable() {
            return this;
        },
        disable() {
            return this;
        }
    };
}

let recorded;

beforeEach(() => {
    recorded = { spans: [], measurements: [] };
    _resetOtelForTest();
});

afterEach(() => {
    trace.disable();
    metrics.disable();
    context.disable();
    _resetOtelForTest();
});

/** Install the fakes and drop the module's memoised tracer/meter so it picks them up. */
function install() {
    context.setGlobalContextManager(fakeContextManager());
    trace.setGlobalTracerProvider(fakeTracerProvider(recorded));
    metrics.setGlobalMeterProvider(fakeMeterProvider(recorded));
    _resetOtelForTest();
}

describe("with no SDK registered", () => {
    it("records nothing and throws nothing", async () => {
        expect(isRecording()).toBe(false);
        _resetOtelForTest();
        const out = await withServerSpan({ method: "tools/call", tool: "cyberchef_md5" },
            async () => "result");
        expect(out).toBe("result");
        expect(traceFields()).toEqual({});
    });

    it("costs effectively nothing per call", async () => {
        // The number that justified the whole design: 100,000 span+metric cycles measured at 8 ms
        // total. The bound here is 30x looser than that so it cannot flake on a loaded CI box,
        // while still failing loudly if someone makes the no-SDK path do real work.
        const started = process.hrtime.bigint();
        for (let i = 0; i < 20000; i++) {
            await withServerSpan({ method: "tools/call", tool: "t" }, async () => 1);
        }
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        expect(ms).toBeLessThan(2000);
    });

    it("adds no fields to a log line", () => {
        // {} rather than {trace_id: null, span_id: null}: an uninstrumented deployment should gain
        // no keys at all, not a pair of nulls every downstream query then has to filter out.
        expect(traceFields()).toEqual({});
        expect(Object.keys(traceFields())).toHaveLength(0);
    });
});

describe("span shape, against a registered provider", () => {
    beforeEach(install);

    it("names the span per the MCP convention", () => {
        // `{mcp.method.name} {target}` is what the conventions specify, which is what lets a
        // backend group by method and by tool without extra configuration.
        return withServerSpan({ method: "tools/call", tool: "cyberchef_md5" }, async () => {
            expect(recorded.spans[0].name).toBe("tools/call cyberchef_md5");
        });
    });

    it("falls back to the bare method when there is no target", async () => {
        await withServerSpan({ method: "tools/list" }, async () => {});
        expect(recorded.spans[0].name).toBe("tools/list");
        expect(recorded.spans[0].attributes[ATTR.TOOL]).toBeUndefined();
    });

    it("sets the required and conditionally-required attributes", async () => {
        await withServerSpan({ method: "tools/call", tool: "cyberchef_md5", transport: "http" },
            async () => {});
        const a = recorded.spans[0].attributes;
        expect(a[ATTR.METHOD]).toBe("tools/call");         // Required
        expect(a[ATTR.TOOL]).toBe("cyberchef_md5");        // Conditionally required
        expect(a[ATTR.TRANSPORT]).toBe("http");            // Recommended
        expect(a[ATTR.OPERATION]).toBe("execute_tool");
    });

    it("ends the span on every path", async () => {
        await withServerSpan({ method: "tools/list" }, async () => {});
        await withServerSpan({ method: "tools/list" }, async () => {
            throw new Error("x");
        })
            .catch(() => {});
        expect(recorded.spans).toHaveLength(2);
        expect(recorded.spans.every(s => s.ended)).toBe(true);
    });

    it("makes the span active, so a log line can correlate without being handed the ids", async () => {
        // Requires a context manager, which every real SDK registers and the bare API does not --
        // see fakeContextManager above.
        await withServerSpan({ method: "tools/call", tool: "t" }, async () => {
            const fields = traceFields();
            expect(fields.trace_id).toBe("0af7651916cd43dd8448eb211c80319c");
            expect(fields.span_id).toBe("b7ad6b7169203331");
        });
        // And nothing leaks outside the span.
        expect(traceFields()).toEqual({});
    });
});

describe("the isRecording probe", () => {
    beforeEach(install);

    it("ends its probe span", async () => {
        // It did not. Against a real provider that leaked an unfinished span on every call --
        // unbounded growth, and a synthetic span in the trace data that no request produced.
        isRecording();
        isRecording();
        isRecording();
        expect(recorded.spans).toHaveLength(3);
        expect(recorded.spans.every(sp => sp.ended)).toBe(true);
    });

    it("still answers correctly while doing so", () => {
        // The span must be closed WITHOUT losing the answer: isRecording() is read before end().
        expect(isRecording()).toBe(true);
    });
});

describe("errors", () => {
    beforeEach(install);

    it("records a thrown error's code, never its message", async () => {
        const err = new Error("failed decrypting key AKIAIOSFODNN7EXAMPLE with password hunter2");
        err.code = "OPERATION_FAILED";
        await expect(withServerSpan({ method: "tools/call", tool: "t" }, async () => {
            throw err;
        }))
            .rejects.toThrow();

        const span = recorded.spans[0];
        expect(span.attributes[ATTR.ERROR_TYPE]).toBe("OPERATION_FAILED");
        expect(span.status.code).toBe(SpanStatusCode.ERROR);
        // The decisive assertion. Error messages quote their input, and for this server the input
        // IS the sensitive material.
        const serialised = JSON.stringify(span.attributes);
        expect(serialised).not.toContain("AKIAIOSFODNN7EXAMPLE");
        expect(serialised).not.toContain("hunter2");
    });

    it("falls back to the exception class when there is no code", async () => {
        await expect(withServerSpan({ method: "tools/call" }, async () => {
            throw new TypeError("x");
        }))
            .rejects.toThrow();
        expect(recorded.spans[0].attributes[ATTR.ERROR_TYPE]).toBe("TypeError");
    });

    it("marks a RETURNED MCP error as an error", async () => {
        // A failed tools/call does not throw: MCP returns `{isError: true}` as an ordinary result.
        // A span that only watches for exceptions reports every failed operation as a success --
        // which is exactly the case an operator is looking for.
        const result = { isError: true, content: [{ type: "text", text: "Error [INVALID_INPUT]: bad" }] };
        const out = await withServerSpan({ method: "tools/call", tool: "t" }, async () => result);
        expect(out).toBe(result);
        expect(recorded.spans[0].attributes[ATTR.ERROR_TYPE]).toBe("INVALID_INPUT");
        expect(recorded.spans[0].status.code).toBe(SpanStatusCode.ERROR);
    });

    it("cannot extract anything but a bare code from an error result", async () => {
        // The pattern matches ONLY an uppercase identifier, so no matter what an operation puts in
        // an error string, nothing but a member of the fixed code enum can reach a backend.
        const nasty = { isError: true, content: [{ type: "text",
            text: "Error [decrypt failed for s3://bucket/secret.pdf]: password was hunter2" }] };
        await withServerSpan({ method: "tools/call", tool: "t" }, async () => nasty);
        const type = recorded.spans[0].attributes[ATTR.ERROR_TYPE];
        expect(type).toBe("tool_error");
        expect(type).not.toContain("hunter2");
        expect(type).not.toContain("bucket");
    });

    it("leaves a successful result unmarked", async () => {
        await withServerSpan({ method: "tools/call", tool: "t" },
            async () => ({ content: [{ type: "text", text: "ok" }] }));
        expect(recorded.spans[0].attributes[ATTR.ERROR_TYPE]).toBeUndefined();
        expect(recorded.spans[0].status).toBeUndefined();
    });
});

describe("the duration histogram", () => {
    beforeEach(install);

    it("records on the SUCCESS path", async () => {
        // The regression this pins: the first draft recorded only inside the catch, so the
        // histogram collected error samples and nothing else -- a latency dashboard showing only
        // failures, with nothing in the graph to reveal that that was what it showed.
        await withServerSpan({ method: "tools/call", tool: "cyberchef_md5" }, async () => "ok");
        expect(recorded.measurements).toHaveLength(1);
        expect(recorded.measurements[0].attributes[ATTR.ERROR_TYPE]).toBeUndefined();
    });

    it("records on the throw path too, exactly once", async () => {
        await expect(withServerSpan({ method: "tools/call", tool: "t" },
            async () => {
                throw new Error("x");
            })).rejects.toThrow();
        expect(recorded.measurements).toHaveLength(1);
        expect(recorded.measurements[0].attributes[ATTR.ERROR_TYPE]).toBe("Error");
    });

    it("uses the name and unit the MCP conventions fix", async () => {
        await withServerSpan({ method: "tools/call", tool: "t" }, async () => {});
        const m = recorded.measurements[0];
        expect(m.name).toBe("mcp.server.operation.duration");
        // SECONDS. Recording milliseconds under a seconds-typed instrument produces a dashboard
        // wrong by three orders of magnitude that nobody notices.
        expect(m.unit).toBe("s");
    });

    it("records a plausible number of seconds, not milliseconds", async () => {
        await withServerSpan({ method: "tools/call", tool: "t" }, async () => {
            await new Promise(r => setTimeout(r, 60));
        });
        const v = recorded.measurements[0].value;
        expect(v).toBeGreaterThan(0.04);
        expect(v).toBeLessThan(2);
    });

    it("is usable on its own, without a span", () => {
        const started = process.hrtime.bigint();
        recordDuration(started, { method: "tools/list" });
        expect(recorded.measurements).toHaveLength(1);
        expect(recorded.measurements[0].attributes[ATTR.METHOD]).toBe("tools/list");
    });
});

describe("attribute names", () => {
    it("are frozen, and match the MCP semantic conventions", () => {
        // The conventions are Development-stability and have already moved repositories once
        // (semantic-conventions v1.42.0, June 2026). Centralised so a rename upstream is one edit;
        // pinned here so a rename is a deliberate one.
        expect(Object.isFrozen(ATTR)).toBe(true);
        expect(ATTR.METHOD).toBe("mcp.method.name");
        expect(ATTR.TOOL).toBe("gen_ai.tool.name");
        expect(ATTR.ERROR_TYPE).toBe("error.type");
        expect(ATTR.OPERATION).toBe("gen_ai.operation.name");
        expect(ATTR.TRANSPORT).toBe("network.transport");
    });

    it("namespaces this project's own attributes so they cannot collide", () => {
        for (const key of ["INPUT_BYTES", "OUTPUT_BYTES", "CACHED", "TENANT"]) {
            expect(ATTR[key].startsWith("cyberchef.")).toBe(true);
        }
    });

    it("defines no attribute for tool arguments or results", () => {
        // The conventions mark gen_ai.tool.call.arguments / .result as Opt-In. This server does not
        // opt in, and the absence is asserted rather than assumed: the arguments to a CyberChef
        // tool ARE the sensitive material, so an attribute added later should have to delete this
        // test and explain itself.
        const values = Object.values(ATTR);
        expect(values).not.toContain("gen_ai.tool.call.arguments");
        expect(values).not.toContain("gen_ai.tool.call.result");
    });
});

describe("trace context from the caller", () => {
    const VALID = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const parentOf = meta => {
        const ctx = parentContextFrom(meta);
        return ctx ? trace.getSpanContext(ctx) : undefined;
    };

    it("joins the caller's trace when they send one", () => {
        // Without this every span this server emits is a ROOT: correct in isolation, and useless
        // for answering "what did that call actually do", because the client's span and the
        // server's sit in two unconnected trees.
        const sc = parentOf({ traceparent: VALID });
        expect(sc.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
        expect(sc.spanId).toBe("00f067aa0ba902b7");
        expect(sc.isRemote).toBe(true);
    });

    it("rejects the all-zero ids the W3C spec defines as invalid", () => {
        // Not pedantry. An all-zero trace id is the INVALID sentinel, so parenting onto it would
        // attach every span to a trace that cannot exist -- silently unreachable, rather than
        // obviously root.
        expect(parentOf({ traceparent: `00-${"0".repeat(32)}-00f067aa0ba902b7-01` })).toBeUndefined();
        expect(parentOf({ traceparent: `00-4bf92f3577b34da6a3ce929d0e0e4736-${"0".repeat(16)}-01` }))
            .toBeUndefined();
    });

    it("starts a root span rather than throwing on anything unparseable", () => {
        // This runs on every tools/call, so it must never be the thing that fails a request.
        for (const meta of [
            undefined, {}, { traceparent: "" }, { traceparent: "nonsense" },
            { traceparent: 42 }, { traceparent: `01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01` }
        ]) {
            expect(parentOf(meta)).toBeUndefined();
        }
    });

    it("ignores baggage unless it is explicitly enabled", () => {
        // Baggage is caller-controlled key/value data that some SDK configurations promote onto
        // span attributes -- the one place caller content could reach a telemetry backend, which
        // this module's standing rule forbids. Trace and span ids are opaque and carry none.
        const saved = process.env.CYBERCHEF_OTEL_BAGGAGE;
        try {
            delete process.env.CYBERCHEF_OTEL_BAGGAGE;
            // The parent still resolves; only the baggage is dropped, and dropping it must not
            // cost the trace.
            expect(parentOf({ traceparent: VALID, baggage: "secret=value" }).traceId)
                .toBe("4bf92f3577b34da6a3ce929d0e0e4736");
        } finally {
            if (saved === undefined) delete process.env.CYBERCHEF_OTEL_BAGGAGE;
            else process.env.CYBERCHEF_OTEL_BAGGAGE = saved;
        }
    });

    it("prefers a registered propagator over parsing the header itself", () => {
        // The manual parse exists because this module depends on the OpenTelemetry API only, and
        // the API's global propagator is a no-op until an operator registers one. When they HAVE
        // registered one, it must win -- it may understand vendor formats this parser does not.
        //
        // Built on the API's own interfaces, like the recording TracerProvider above, because
        // registering a real one would mean depending on the SDK this module exists to avoid.
        const propagator = {
            inject() {},
            fields: () => ["traceparent"],
            extract(ctx, carrier) {
                // A deliberately DIFFERENT span id from the header, so the assertion below can
                // only pass if the propagator's answer was used rather than the manual parse.
                if (!carrier?.traceparent) return ctx;
                return trace.setSpanContext(ctx, {
                    traceId: "11111111111111111111111111111111",
                    spanId: "2222222222222222",
                    traceFlags: 1,
                    isRemote: true
                });
            }
        };
        propagation.setGlobalPropagator(propagator);
        try {
            const sc = parentOf({ traceparent: VALID });
            expect(sc.traceId).toBe("11111111111111111111111111111111");
            expect(sc.spanId).toBe("2222222222222222");
        } finally {
            propagation.disable();
        }
    });

    it("carries baggage and tracestate when the operator opts in", () => {
        // The opt-in path. Both are passed to the PROPAGATOR rather than parsed here -- only
        // `traceparent` has a manual fallback, because it is the one the parent depends on.
        //
        // So the assertion has to be on the carrier the propagator was handed. Asserting the
        // resulting traceId instead proves nothing: with no propagator registered, the manual
        // fallback parses `traceparent` and returns the same id whether or not the other two
        // fields were ever copied across. That earlier version of this test passed with the
        // `tracestate` and `baggage` lines of `parentContextFrom` deleted.
        const seen = [];
        const propagator = {
            inject() {},
            fields: () => ["traceparent", "tracestate", "baggage"],
            extract(ctx, carrier) {
                seen.push({ ...carrier });
                return ctx;
            }
        };
        const saved = process.env.CYBERCHEF_OTEL_BAGGAGE;
        propagation.setGlobalPropagator(propagator);
        try {
            process.env.CYBERCHEF_OTEL_BAGGAGE = "true";
            const sc = parentOf({
                traceparent: VALID,
                tracestate: "vendor=opaque",
                baggage: "deployment=blue"
            });

            expect(seen).toHaveLength(1);
            expect(seen[0].traceparent).toBe(VALID);
            expect(seen[0].tracestate).toBe("vendor=opaque");
            expect(seen[0].baggage).toBe("deployment=blue");
            // The propagator here returns the context unchanged, so the manual fallback still
            // yields the parent -- which is the behaviour a propagator that does not understand
            // the header should get.
            expect(sc.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
        } finally {
            propagation.disable();
            if (saved === undefined) delete process.env.CYBERCHEF_OTEL_BAGGAGE;
            else process.env.CYBERCHEF_OTEL_BAGGAGE = saved;
        }
    });

    it("withholds baggage unless the operator opts in, and never withholds tracestate", () => {
        // Baggage is opt-in because it is arbitrary caller-supplied key/value data that would
        // otherwise ride into every span; `tracestate` is part of the trace context itself and is
        // always forwarded. Without this case the opt-in could be deleted and the suite stay
        // green -- the test above only exercises the enabled branch.
        const seen = [];
        const propagator = {
            inject() {},
            fields: () => ["traceparent", "tracestate", "baggage"],
            extract(ctx, carrier) {
                seen.push({ ...carrier });
                return ctx;
            }
        };
        const saved = process.env.CYBERCHEF_OTEL_BAGGAGE;
        propagation.setGlobalPropagator(propagator);
        try {
            delete process.env.CYBERCHEF_OTEL_BAGGAGE;
            parentOf({ traceparent: VALID, tracestate: "vendor=opaque", baggage: "secret=1" });

            expect(seen[0].tracestate).toBe("vendor=opaque");
            expect(seen[0].baggage).toBeUndefined();
        } finally {
            propagation.disable();
            if (saved === undefined) delete process.env.CYBERCHEF_OTEL_BAGGAGE;
            else process.env.CYBERCHEF_OTEL_BAGGAGE = saved;
        }
    });
});
