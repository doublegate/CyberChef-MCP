import babelParser from "@babel/eslint-parser";
import jsdoc from "eslint-plugin-jsdoc";
import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    // Ignore patterns for generated files and vendor code
    {
        ignores: [
            "src/core/vendor/**",
            "src/core/config/OperationConfig.json",
            "src/node/index.mjs",
            "build/**",
            "node_modules/**"
        ]
    },
    {
        languageOptions: {
            ecmaVersion: 2022,
            parser: babelParser,
            parserOptions: {
                ecmaVersion: 2022,
                ecmaFeatures: {
                    impliedStrict: true
                },
                sourceType: "module",
                allowImportExportEverywhere: true
            },
            globals: {
                // Node.js environment for MCP server
                ...globals.node,
                ...globals.es6,
                // Browser globals for operations that support Web Worker environments
                ...globals.browser,

                // CyberChef-specific globals
                "$": false,
                "jQuery": false,
                "log": false,
                "app": false,

                // Build-time constants
                "COMPILE_TIME": false,
                "COMPILE_MSG": false,
                "PKG_VERSION": false
            },
        },
        plugins: {
            jsdoc
        },
        rules: {
            // enable additional rules
            "no-eval": "error",
            "no-implied-eval": "error",
            "dot-notation": "error",
            "eqeqeq": ["error", "smart"],
            "no-caller": "error",
            "no-extra-bind": "error",
            "no-unused-expressions": "error",
            "no-useless-call": "error",
            "no-useless-return": "error",
            "radix": "warn",

            // modify rules from base configurations
            "no-unused-vars": ["error", {
                "args": "none",
                "vars": "all",
                "caughtErrors": "none"
            }],
            "no-empty": ["error", {
                "allowEmptyCatch": true
            }],

            // disable rules from base configurations
            "no-control-regex": "off",
            "require-atomic-updates": "off",
            "no-async-promise-executor": "off",

            // stylistic conventions
            "brace-style": ["error", "1tbs"],
            "space-before-blocks": ["error", "always"],
            "block-spacing": "error",
            "array-bracket-spacing": "error",
            "comma-spacing": "error",
            "spaced-comment": ["error", "always", { "exceptions": ["/"] }],
            "comma-style": "error",
            "computed-property-spacing": "error",
            "no-trailing-spaces": "warn",
            "eol-last": "error",
            "func-call-spacing": "error",
            "key-spacing": ["warn", {
                "mode": "minimum"
            }],
            "indent": ["error", 4, {
                "ignoreComments": true,
                "ArrayExpression": "first",
                "SwitchCase": 1
            }],
            "linebreak-style": ["error", "unix"],
            "quotes": ["error", "double", {
                "avoidEscape": true,
                "allowTemplateLiterals": true
            }],
            "camelcase": ["error", {
                "properties": "always"
            }],
            "semi": ["error", "always"],
            "unicode-bom": "error",
            "jsdoc/require-jsdoc": ["error", {
                "require": {
                    "FunctionDeclaration": true,
                    "MethodDefinition": true,
                    "ClassDeclaration": true,
                    "ArrowFunctionExpression": false
                }
            }],
            "keyword-spacing": ["error", {
                "before": true,
                "after": true
            }],
            "no-multiple-empty-lines": ["warn", {
                "max": 2,
                "maxEOF": 1,
                "maxBOF": 0
            }],
            "no-whitespace-before-property": "error",
            "operator-linebreak": ["error", "after"],
            "space-in-parens": "error",
            "no-var": "error",
            "prefer-const": "error",
            "no-console": "error"
        },
    },
    // File-pattern specific overrides
    {
        // A command-line tool's entire output IS the console. `no-console` exists to stop a
        // SERVER writing to stdout -- which for an MCP stdio server would corrupt the JSON-RPC
        // stream, and did, right up to v2.1.0 -- but a CLI has no other channel.
        files: ["src/node/cli/**/*", "scripts/**/*.mjs"],
        rules: {
            "no-console": "off"
        }
    },
    {
        files: ["tests/**/*"],
        rules: {
            "no-unused-expressions": "off",
            "no-console": "off"
        }
    },
    // src/core/** is mirrored VERBATIM from GCHQ CyberChef. The 8 residual src/web/** files
    // are upstream-derived leftovers from the v1.7.1 web-app removal -- OutputWaiter.mjs
    // does differ from upstream, so "verbatim" would be wrong for it; they are grouped here
    // because this fork does not develop the web app, not because they are byte-identical. Rules that fire only there are
    // unfixable by this fork: a hand-edit is overwritten by the next upstream sync, and the
    // incident record at docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md is what
    // happens when someone tries anyway.
    {
        files: ["src/core/**/*", "src/web/**/*"],
        rules: {
            // New in ESLint 10's recommended set. It reports 73 times across 42 upstream files
            // and ZERO times in fork-owned code -- verified by classifying every violation
            // against the reference checkout before switching it off. Style-level: it flags
            // assignments whose value is never read, not a correctness defect.
            //
            // Deliberately scoped to src/core rather than disabled globally: it stays ACTIVE on
            // src/node/** and tests/mcp/**, which is the code this fork actually writes.
            "no-useless-assignment": "off",
            // Also new in ESLint 10. Both violations are in upstream's
            // src/core/lib/Protobuf.mjs, which rethrows without `cause`. Same reasoning:
            // unfixable here, and it stays ACTIVE on fork-owned code where attaching
            // `cause` is a real improvement we can make and keep.
            "preserve-caught-error": "off"
        }
    },
];
