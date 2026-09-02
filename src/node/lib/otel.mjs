/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * OpenTelemetry instrumentation, following the MCP semantic conventions.
 *
 * THE API, NOT THE SDK -- AND THAT IS THE WHOLE DESIGN
 * ---------------------------------------------------
 * This module depends on `@opentelemetry/api` and nothing else. It creates spans and records
 * metrics; it never configures an exporter, a sampler or a processor. An operator who wants
 * telemetry supplies the SDK themselves, which is the standard Node pattern:
 *
 *     node --require ./otel-bootstrap.mjs src/node/mcp-server.mjs
 *
 * The v2.7.0 plan asked for the SDK to be integrated directly, plus exporters for "3+ backends
 * (Jaeger, Datadog, New Relic)". Measured before deciding:
 *
 *     @opentelemetry/sdk-node + OTLP + Prometheus exporters   71 packages   50 MB   +100 ms startup
 *     @opentelemetry/api alone                                 1 package   2.6 MB    +9 ms startup
 *
 * v2.6.0 spent the whole release getting cold start from 1300 ms to 185 ms. Shipping the SDK
 * eagerly costs +100 ms -- more than half that win given back, on every stdio launch, for users
 * who are collecting nothing. Nearly every launch of this server is an editor starting a
 * subprocess on stdio, where there is no collector and never will be.
 *
 * And the API is genuinely free when no SDK is registered. Measured:
 *
 *     100,000 span + metric cycles, no SDK:   8 ms total   (0.08 microseconds each)
 *     tracer.startSpan(...).isRecording():    false
 *
 * So instrumentation costs nothing until someone asks for it, and the operator picks the exporter
 * -- which means EVERY OTLP backend works rather than the three the plan named.
 *
 * WHAT IS DELIBERATELY NOT RECORDED
 * ---------------------------------
 * The MCP conventions define `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` as
 * **Opt-In**. They are never emitted here, and the reason is specific to this server rather than
 * general caution: the arguments to a CyberChef tool ARE the sensitive material. A key, a
 * password hash, a document being decoded. Shipping them to a tracing backend would copy exactly
 * the data the caller is analysing into a system with different retention, different access
 * control, and usually a longer memory. The audit trail excludes error messages for the same
 * reason; this is that rule applied where the temptation is larger.
 *
 * Sizes and counts are recorded. Content never is.
 *
 * STABILITY
 * ---------
 * The MCP semantic conventions are **Development**, not Stable, and moved repositories in
 * semantic-conventions v1.42.0 (June 2026). Attribute names here may change; they are centralised
 * in `ATTR` below so that a rename is one edit rather than a search.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { trace, metrics, SpanStatusCode, SpanKind, context } from "@opentelemetry/api";
import { VERSION } from "./config.mjs";

/** Instrumentation scope, as it will appear in a backend. */
const SCOPE = "cyberchef-mcp";

/**
 * Attribute names from the MCP semantic conventions.
 *
 * Centralised because the conventions are Development-stability and have already moved once. A
 * rename upstream should be one edit here, not a grep across the server.
 */
export const ATTR = Object.freeze({
    // Required.
    METHOD: "mcp.method.name",
    // Conditionally required.
    TOOL: "gen_ai.tool.name",
    PROMPT: "gen_ai.prompt.name",
    RESOURCE_URI: "mcp.resource.uri",
    ERROR_TYPE: "error.type",
    // Recommended.
    OPERATION: "gen_ai.operation.name",
    PROTOCOL_VERSION: "mcp.protocol.version",
    TRANSPORT: "network.transport",
    // Ours, namespaced so it cannot collide with a future convention.
    INPUT_BYTES: "cyberchef.input.bytes",
    OUTPUT_BYTES: "cyberchef.output.bytes",
    CACHED: "cyberchef.cache.hit",
    TENANT: "cyberchef.tenant"
});

let tracer = null;
let meter = null;
let durationHistogram = null;

/** @returns {import("@opentelemetry/api").Tracer} The tracer, created once. */
function getTracer() {
    if (!tracer) tracer = trace.getTracer(SCOPE, VERSION);
    return tracer;
}

/** @returns {import("@opentelemetry/api").Histogram} The operation-duration histogram. */
function getDurationHistogram() {
    if (!durationHistogram) {
        if (!meter) meter = metrics.getMeter(SCOPE, VERSION);
        // Name and unit are both fixed by the MCP conventions: seconds, not milliseconds.
        // Recording milliseconds under a seconds-typed instrument is the kind of error that
        // produces a dashboard nobody notices is wrong by three orders of magnitude.
        durationHistogram = meter.createHistogram("mcp.server.operation.duration", {
            description: "Duration of an MCP server operation",
            unit: "s"
        });
    }
    return durationHistogram;
}

/**
 * Run `fn` inside a server span named per the MCP conventions.
 *
 * Span name is `{mcp.method.name} {target}` where target is the tool or prompt name, which is what
 * the conventions specify -- so a backend groups by method and by tool without extra configuration.
 *
 * The span is ended in `finally`, and the status is set from the outcome, so an operation that
 * throws is still reported rather than leaving an unclosed span. A thrown error sets
 * `error.type` to the error's CODE or constructor name, never its message: a message can quote the
 * input, which is the same reason the audit trail omits it.
 *
 * @param {Object} spec - Span description.
 * @param {string} spec.method - The MCP method, e.g. `tools/call`.
 * @param {string} [spec.tool] - Tool name, when the method targets one.
 * @param {string} [spec.transport] - `stdio`, `http` or `socket`.
 * @param {Object} [spec.attributes] - Extra attributes; sizes and counts only.
 * @param {Function} fn - The work. Receives the span.
 * @returns {Promise<*>} Whatever `fn` returns.
 */
export async function withServerSpan({ method, tool, transport, attributes = {} }, fn) {
    const name = tool ? `${method} ${tool}` : method;
    const span = getTracer().startSpan(name, {
        kind: SpanKind.SERVER,
        attributes: {
            [ATTR.METHOD]: method,
            ...(tool ? { [ATTR.TOOL]: tool, [ATTR.OPERATION]: "execute_tool" } : {}),
            ...(transport ? { [ATTR.TRANSPORT]: transport } : {}),
            ...attributes
        }
    });

    const started = process.hrtime.bigint();
    let errorType;
    try {
        // `context.with` makes this the ACTIVE span, which is what lets log records pick up the
        // trace id without every log call being handed one explicitly.
        const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
        // A FAILED tools/call does not throw. MCP returns tool failures as an ordinary result
        // with `isError: true`, so a span that only watches for exceptions reports every failed
        // operation as a success -- which is precisely the case an operator is looking for.
        errorType = errorTypeOfResult(result);
        if (errorType) {
            span.setAttribute(ATTR.ERROR_TYPE, errorType);
            span.setStatus({ code: SpanStatusCode.ERROR });
        }
        return result;
    } catch (err) {
        // The CODE, not the message. See the module note on what is never recorded.
        errorType = err?.code || err?.constructor?.name || "Error";
        span.setAttribute(ATTR.ERROR_TYPE, errorType);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
    } finally {
        // Recorded HERE, on every path, and exactly once. An earlier revision recorded only in
        // the catch, which meant the duration histogram collected error samples and nothing else
        // -- a latency dashboard showing only failures, and no way to tell from the graph that
        // that was what it showed.
        recordDuration(started, { method, tool, errorType });
        span.end();
    }
}

/**
 * The error type of an MCP tool result, or undefined when it succeeded.
 *
 * The structured error carries its code inside the rendered text (`Error [CODE]: message`), so
 * the code is recovered with a regex that matches ONLY a bare uppercase identifier. That bound is
 * the point: the pattern cannot capture a message, a path, an argument or any part of the input,
 * so no matter what an operation puts in an error string, nothing but a member of the fixed code
 * enum can reach a telemetry backend. A failure that does not match falls back to `tool_error`.
 *
 * @param {*} result - The value the handler returned.
 * @returns {string|undefined} An error type, or undefined for success.
 */
function errorTypeOfResult(result) {
    if (!result || result.isError !== true) return undefined;
    const text = result.content?.[0]?.text;
    const match = typeof text === "string" ? /^Error \[([A-Z][A-Z0-9_]*)\]/.exec(text) : null;
    return match ? match[1] : "tool_error";
}

/**
 * Record one operation's duration on the conventional histogram.
 *
 * Separate from the span so a caller that is not tracing still gets metrics, and so the error path
 * above can record before rethrowing.
 *
 * @param {bigint} startedAt - `process.hrtime.bigint()` from before the work.
 * @param {Object} labels - `{method, tool, errorType}`.
 * @returns {void}
 */
export function recordDuration(startedAt, { method, tool, errorType } = {}) {
    // hrtime rather than Date.now(): a duration histogram wants a monotonic clock, and the
    // difference shows up as negative buckets when the wall clock steps.
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    getDurationHistogram().record(seconds, {
        ...(method ? { [ATTR.METHOD]: method } : {}),
        ...(tool ? { [ATTR.TOOL]: tool } : {}),
        ...(errorType ? { [ATTR.ERROR_TYPE]: errorType } : {})
    });
}

/**
 * Trace and span ids for the current context, for log correlation.
 *
 * Returns an empty object when nothing is recording, so a log line gains no fields at all rather
 * than a pair of nulls that every downstream query then has to filter out.
 *
 * REQUIRES A CONTEXT MANAGER, which the bare API does not provide. `@opentelemetry/api` ships a
 * no-op manager: `context.with()` runs the callback but stores nothing, so `getActiveSpan()`
 * returns undefined and this returns {}. Every real SDK registers AsyncLocalStorageContextManager
 * and correlation then works.
 *
 * That ordering is harmless -- with no SDK there are no traces to correlate a log line TO -- but it
 * is worth stating, because "no trace_id in my logs" has two very different causes and only one of
 * them is a bug.
 *
 * @returns {{trace_id?: string, span_id?: string}} Correlation fields.
 */
export function traceFields() {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    if (!ctx || !ctx.traceId || ctx.traceId === "00000000000000000000000000000000") return {};
    // Snake case, matching the OpenTelemetry log data model rather than this project's camelCase
    // log fields -- a collector correlating logs to traces looks for these exact names.
    return { "trace_id": ctx.traceId, "span_id": ctx.spanId };
}

/** @returns {boolean} Whether an SDK is actually recording. Test seam and diagnostics. */
export function isRecording() {
    return getTracer().startSpan("probe").isRecording();
}

/** Test seam: drop the memoised tracer/meter so a test can register an SDK first. */
export function _resetOtelForTest() {
    tracer = null;
    meter = null;
    durationHistogram = null;
}
