/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `cyberchef.config.json` -- the configuration file v2.0.0 promised.
 *
 * WHY THIS EXISTS
 * ---------------
 * `docs/v2.0.0-breaking-changes.md` has told users, under a heading reading "v2.0.0 (New)", to
 * create a unified configuration file since v1.8.0. **No loader was ever written.** Before this
 * module the only occurrence of the string `cyberchef.config.json` in the entire source was the
 * deprecation message recommending it. Measured before building:
 *
 *     cyberchef.config.json present, asking for maxInputSize 1024
 *     MAX_INPUT_SIZE actually in effect: 104857600
 *     -> SILENTLY IGNORED
 *
 * A user followed the published guide, wrote a file, restarted, and got no error, no warning and
 * none of their settings. That is the same shape as the SafeRegex incident: documentation asserting
 * a behaviour the code does not have, with nothing that would ever report the gap.
 *
 * It is also worth having on its own merits. There are **64 settings**, and configuring a
 * deployment means setting up to 64 environment variables with no single place to see them, nothing
 * to validate them, and no way to tell a misspelt variable from an unset one.
 *
 * HOW IT WORKS, AND WHY IT WORKS THAT WAY
 * ---------------------------------------
 * The file is translated into `process.env` before anything reads it, rather than threaded through
 * a new configuration object. That is deliberate: settings are read at MODULE LOAD in ~30 places
 * (`config.mjs` holds 18 of them, but `recipe-storage.mjs`, `tool-surface.mjs`, `safe-regex.mjs`
 * and `transports.mjs` each read their own), so a new object would have meant touching every one of
 * those call sites and would have left any missed site silently reading the old source. Populating
 * the environment fixes all 64 at once and leaves every consumer unchanged.
 *
 * The cost is that **load order matters**: this must run before the first module that reads a
 * setting. See `bootstrap-config.mjs`, which is imported first in the entry points for exactly that
 * reason, and says so.
 *
 * PRECEDENCE
 * ----------
 *     environment variable  >  config file  >  built-in default
 *
 * Implemented by only setting a variable the environment has not already set, which is what makes
 * `docker run -e CYBERCHEF_OFFLINE=true` still win over a file baked into an image.
 *
 * FAIL CLOSED
 * -----------
 * A malformed file, an unknown section, an unknown key or a value of the wrong shape is an ERROR,
 * not a warning. This will occasionally annoy someone, and it is the right trade: the bug being
 * fixed here is *a setting that was silently ignored*, in a security toolkit whose configuration
 * includes an offline switch, a regex-length cap and an operation allowlist. Accepting a typo'd
 * security key and carrying on would reproduce the original failure in a new place.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Where the file is looked for when `CYBERCHEF_CONFIG_FILE` is not set. */
const DEFAULT_CONFIG_FILENAME = "cyberchef.config.json";

/**
 * Every setting, grouped, mapped to the environment variable that already carries it.
 *
 * Generated from the settings actually read by `src/node/**` and committed as a literal rather than
 * derived at runtime. A runtime transform (upper-case, insert underscores) would silently produce
 * the wrong variable name for any setting that does not follow the pattern -- `maxSessions` is
 * `CYBERCHEF_MAX_SESSIONS`, not `CYBERCHEF_HTTP_MAX_SESSIONS`, despite living under `http` -- and a
 * wrong name here fails in exactly the way this whole module exists to stop.
 */
const SETTINGS = Object.freeze({
    server: {
        binaryOutput: "CYBERCHEF_BINARY_OUTPUT",
        drainDelayMs: "CYBERCHEF_DRAIN_DELAY_MS",
        drainTimeoutMs: "CYBERCHEF_DRAIN_TIMEOUT_MS",
        maxConcurrentOps: "CYBERCHEF_MAX_CONCURRENT_OPS",
        maxInputSize: "CYBERCHEF_MAX_INPUT_SIZE",
        maxToolDescription: "CYBERCHEF_MAX_TOOL_DESCRIPTION",
        operationTimeout: "CYBERCHEF_OPERATION_TIMEOUT",
        transport: "CYBERCHEF_TRANSPORT"
    },
    cache: {
        enabled: "CYBERCHEF_CACHE_ENABLED",
        maxItems: "CYBERCHEF_CACHE_MAX_ITEMS",
        maxSize: "CYBERCHEF_CACHE_MAX_SIZE"
    },
    batch: {
        enabled: "CYBERCHEF_BATCH_ENABLED",
        maxSize: "CYBERCHEF_BATCH_MAX_SIZE"
    },
    streaming: {
        enabled: "CYBERCHEF_ENABLE_STREAMING",
        threshold: "CYBERCHEF_STREAMING_THRESHOLD",
        chunkSize: "CYBERCHEF_STREAM_CHUNK_SIZE",
        maxChunks: "CYBERCHEF_STREAM_MAX_CHUNKS",
        progressInterval: "CYBERCHEF_STREAM_PROGRESS_INTERVAL"
    },
    workers: {
        enabled: "CYBERCHEF_ENABLE_WORKERS",
        idleTimeout: "CYBERCHEF_WORKER_IDLE_TIMEOUT",
        maxThreads: "CYBERCHEF_WORKER_MAX_THREADS",
        minInputSize: "CYBERCHEF_WORKER_MIN_INPUT_SIZE",
        minThreads: "CYBERCHEF_WORKER_MIN_THREADS"
    },
    retry: {
        backoffMultiplier: "CYBERCHEF_BACKOFF_MULTIPLIER",
        initialBackoff: "CYBERCHEF_INITIAL_BACKOFF",
        maxBackoff: "CYBERCHEF_MAX_BACKOFF",
        maxRetries: "CYBERCHEF_MAX_RETRIES"
    },
    rateLimit: {
        enabled: "CYBERCHEF_RATE_LIMIT_ENABLED",
        requests: "CYBERCHEF_RATE_LIMIT_REQUESTS",
        window: "CYBERCHEF_RATE_LIMIT_WINDOW"
    },
    recipes: {
        backup: "CYBERCHEF_RECIPE_BACKUP",
        maxCount: "CYBERCHEF_RECIPE_MAX_COUNT",
        maxDepth: "CYBERCHEF_RECIPE_MAX_DEPTH",
        maxOperations: "CYBERCHEF_RECIPE_MAX_OPERATIONS",
        storage: "CYBERCHEF_RECIPE_STORAGE"
    },
    http: {
        allowedHosts: "CYBERCHEF_ALLOWED_HOSTS",
        allowedOrigins: "CYBERCHEF_ALLOWED_ORIGINS",
        host: "CYBERCHEF_HTTP_HOST",
        maxBody: "CYBERCHEF_HTTP_MAX_BODY",
        maxSessions: "CYBERCHEF_MAX_SESSIONS",
        path: "CYBERCHEF_HTTP_PATH",
        port: "CYBERCHEF_HTTP_PORT",
        sessionTimeout: "CYBERCHEF_SESSION_TIMEOUT"
    },
    socket: {
        allowRemote: "CYBERCHEF_SOCKET_ALLOW_REMOTE",
        host: "CYBERCHEF_SOCKET_HOST",
        maxConnections: "CYBERCHEF_SOCKET_MAX_CONNECTIONS",
        path: "CYBERCHEF_SOCKET_PATH",
        port: "CYBERCHEF_SOCKET_PORT"
    },
    auth: {
        audience: "CYBERCHEF_AUTH_AUDIENCE",
        issuer: "CYBERCHEF_AUTH_ISSUER",
        jwksUri: "CYBERCHEF_AUTH_JWKS_URI",
        requiredScopes: "CYBERCHEF_AUTH_REQUIRED_SCOPES",
        resource: "CYBERCHEF_AUTH_RESOURCE",
        tenantClaim: "CYBERCHEF_TENANT_CLAIM"
    },
    tools: {
        allowlist: "CYBERCHEF_TOOL_ALLOWLIST",
        exposeAllOps: "CYBERCHEF_EXPOSE_ALL_OPS",
        surface: "CYBERCHEF_TOOL_SURFACE"
    },
    security: {
        auditEnabled: "CYBERCHEF_AUDIT_ENABLED",
        maxRegexLength: "CYBERCHEF_MAX_REGEX_LENGTH",
        offline: "CYBERCHEF_OFFLINE"
    },
    observability: {
        metricsEnabled: "CYBERCHEF_METRICS_ENABLED",
        telemetryEnabled: "CYBERCHEF_TELEMETRY_ENABLED"
    },
    compatibility: {
        suppressDeprecations: "CYBERCHEF_SUPPRESS_DEPRECATIONS",
        v2CompatibilityMode: "V2_COMPATIBILITY_MODE"
    }
});

/**
 * The settings that are genuinely lists, and are the only ones an array is valid for.
 *
 * Derived from the code that PARSES them, not from the name: each of these is split on commas by
 * its consumer -- `configuredAllowlist` in `tool-surface.mjs`, the `csv()` helper in
 * `transports.mjs`, and `csvScopes` in `auth.mjs`.
 *
 * Accepting an array anywhere else silently corrupts the value. `server.maxInputSize: [1024, 2048]`
 * joined to `"1024,2048"`, and `parseInt` takes the leading `1024` without complaint -- so the
 * server runs with a limit the operator never wrote and nothing reports it. That is the exact
 * failure this module exists to prevent, so an array on a scalar setting is now an error.
 */
const LIST_SETTINGS = new Set([
    "CYBERCHEF_TOOL_ALLOWLIST",
    "CYBERCHEF_ALLOWED_HOSTS",
    "CYBERCHEF_ALLOWED_ORIGINS",
    "CYBERCHEF_AUTH_REQUIRED_SCOPES"
]);

/**
 * An error in the configuration file.
 *
 * A plain Error rather than the structured `CyberChefMCPError`: this is thrown during module load,
 * before the server or its logger exists, and importing `errors.mjs` here would pull the error
 * machinery -- and anything it imports -- into the load order this module has to run ahead of.
 */
export class ConfigFileError extends Error {
    /**
     * @param {string} message - What is wrong, and where.
     */
    constructor(message) {
        super(message);
        this.name = "ConfigFileError";
    }
}

/**
 * Suggest the closest known name, for a key that is not one.
 *
 * A typo is the likeliest reason an unknown key appears, and "unknown key `maxInputSze`" is a much
 * poorer error than one that names the key the user meant.
 *
 * @param {string} unknown - The key that was not recognised.
 * @param {string[]} known - The keys that would have been.
 * @returns {string} A " (did you mean x?)" clause, or an empty string.
 */
function suggest(unknown, known) {
    const target = unknown.toLowerCase();

    // Edit distance, not substring containment. The first version of this used
    // `includes()` in both directions and produced NO suggestion for either of the two typos it
    // was written for -- "sever" is not a substring of "server", and "maxInputSze" is not a
    // substring of "maxInputSize". Dropped letters and transpositions are what typos actually
    // are, and only a distance measure catches them.
    const distance = (a, b) => {
        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const row = [i];
            for (let j = 1; j <= b.length; j++) {
                row[j] = Math.min(
                    prev[j] + 1,
                    row[j - 1] + 1,
                    prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
            prev = row;
        }
        return prev[b.length];
    };

    let best = null;
    let bestDistance = Infinity;
    for (const candidate of known) {
        const d = distance(target, candidate.toLowerCase());
        if (d < bestDistance) {
            bestDistance = d;
            best = candidate;
        }
    }

    // Scaled to the name's length, so "sever"/"server" (1) suggests while two unrelated long names
    // do not. A third of the length, floor 1, is generous enough for a couple of slips and tight
    // enough that a genuinely wrong name is reported as wrong rather than guessed at.
    const limit = Math.max(1, Math.floor(target.length / 3));
    return best !== null && bestDistance <= limit ? ` (did you mean "${best}"?)` : "";
}

/**
 * Render one configuration value as the string an environment variable holds.
 *
 * @param {*} value - The value from the file.
 * @param {string} where - Dotted path, for the error message.
 * @returns {string} The environment-variable form.
 * @throws {ConfigFileError} If the value cannot be one.
 */
function toEnvValue(value, where, envName) {
    if (Array.isArray(value) && !LIST_SETTINGS.has(envName)) {
        throw new ConfigFileError(
            `${where}: this setting takes a single value, not a list. Only ` +
            `${[...LIST_SETTINGS].length} settings are lists, and this is not one of them`);
    }
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new ConfigFileError(`${where}: ${value} is not a finite number`);
        }
        return String(value);
    }
    if (Array.isArray(value)) {
        // The settings that take lists -- allowlist, allowedHosts, requiredScopes -- are read as
        // comma-separated strings, so an array is the natural JSON shape for them and is joined
        // here rather than rejected.
        const bad = value.find(v => typeof v !== "string" && typeof v !== "number");
        if (bad !== undefined) {
            throw new ConfigFileError(
                `${where}: arrays may contain only strings or numbers, found ${typeof bad}`);
        }
        return value.join(",");
    }
    throw new ConfigFileError(
        `${where}: expected a string, number, boolean or array, found ` +
        `${value === null ? "null" : typeof value}`);
}

/**
 * Translate a parsed configuration object into environment-variable assignments.
 *
 * Split out from the file handling so it is testable without a filesystem, and so the validation
 * rules have one home.
 *
 * @param {Object} config - The parsed configuration.
 * @param {Object} env - The environment to read for precedence.
 * @returns {{applied: Object, deferredToEnv: string[]}} What to set, and what the environment wins.
 * @throws {ConfigFileError} On any unknown section, unknown key or bad value.
 */
export function resolveConfig(config, env = process.env) {
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
        throw new ConfigFileError(
            `the top level must be an object, found ${Array.isArray(config) ? "an array" : config === null ? "null" : typeof config}`);
    }

    const applied = {};
    const deferredToEnv = [];
    const sections = Object.keys(SETTINGS);

    for (const [section, values] of Object.entries(config)) {
        // `$schema` is allowed and ignored, so an editor can be pointed at a schema for
        // completions without the file then failing to load.
        if (section === "$schema") continue;

        if (!Object.hasOwn(SETTINGS, section)) {
            throw new ConfigFileError(
                `unknown section "${section}"${suggest(section, sections)}. ` +
                `Known sections: ${sections.join(", ")}`);
        }
        if (values === null || typeof values !== "object" || Array.isArray(values)) {
            throw new ConfigFileError(`"${section}" must be an object of settings`);
        }

        const known = Object.keys(SETTINGS[section]);
        for (const [key, value] of Object.entries(values)) {
            if (!Object.hasOwn(SETTINGS[section], key)) {
                throw new ConfigFileError(
                    `unknown setting "${section}.${key}"${suggest(key, known)}. ` +
                    `Known settings in "${section}": ${known.join(", ")}`);
            }

            const envName = SETTINGS[section][key];

            // VALIDATED BEFORE PRECEDENCE IS APPLIED, not after.
            //
            // Checking the value only when the file is about to win made a file's validity depend
            // on the environment it happened to load in: `security.offline: {}` was accepted while
            // `CYBERCHEF_OFFLINE` was set, and became a startup failure the day someone removed
            // the override. A file that passes in staging and fails in production because an
            // unrelated variable was dropped is precisely the kind of surprise a fail-closed
            // loader is supposed to remove.
            const converted = toEnvValue(value, `${section}.${key}`, envName);

            // Precedence. An environment variable that is present -- even empty -- wins, because
            // an operator setting one at run time is being more specific than a file baked into an
            // image, and silently overriding them would be its own surprise. The converted value
            // is discarded, but it had to be correct to get here.
            if (env[envName] !== undefined) {
                deferredToEnv.push(`${section}.${key}`);
                continue;
            }
            applied[envName] = converted;
        }
    }

    return { applied, deferredToEnv };
}

/**
 * Read `cyberchef.config.json`, if there is one, and apply it to the environment.
 *
 * @param {Object} [options] - Options.
 * @param {Object} [options.env] - Environment to populate (defaults to `process.env`).
 * @param {string} [options.cwd] - Directory to resolve the default filename against.
 * @returns {{path: ?string, applied: string[], deferredToEnv: string[]}} What happened.
 * @throws {ConfigFileError} If a file was named explicitly and is missing, or any file is invalid.
 */
export function applyConfigFile({ env = process.env, cwd = process.cwd() } = {}) {
    const explicit = env.CYBERCHEF_CONFIG_FILE;
    const path = explicit ? resolve(cwd, explicit) : resolve(cwd, DEFAULT_CONFIG_FILENAME);

    let raw;
    try {
        raw = readFileSync(path, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            // Absent by default is the ordinary case and stays silent -- the environment-only
            // deployment that every release before this one supported.
            //
            // But a path the operator NAMED and that is not there is an error. Treating it as "no
            // configuration" would be the original bug wearing a different hat: the whole point is
            // that a configuration a user asked for is never silently skipped.
            if (explicit) {
                throw new ConfigFileError(
                    `CYBERCHEF_CONFIG_FILE points at "${path}", which does not exist`);
            }
            return { path: null, applied: [], deferredToEnv: [] };
        }
        throw new ConfigFileError(`could not read "${path}": ${error.message}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new ConfigFileError(`"${path}" is not valid JSON: ${error.message}`);
    }

    const { applied, deferredToEnv } = resolveConfig(parsed, env);
    for (const [name, value] of Object.entries(applied)) env[name] = value;

    return { path, applied: Object.keys(applied), deferredToEnv };
}

export { SETTINGS, DEFAULT_CONFIG_FILENAME };
