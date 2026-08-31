module.exports = function(api) {
    api.cache.forever();

    return {
        "presets": [
            // Babel 8 removed `useBuiltIns` and `corejs` from preset-env in favour of
            // babel-plugin-polyfill-corejs3, which centralises core-js injection instead of
            // splitting it between preset-env and plugin-transform-runtime.
            ["@babel/preset-env", {
                "modules": false
            }]
        ],
        "plugins": [
            "dynamic-import-node",
            // Replaces preset-env's removed `useBuiltIns: "entry"` + `corejs: 3`.
            // "entry-global" is the direct equivalent: it rewrites `import "core-js/stable"`
            // into the individual core-js entry points the target environments need.
            ["polyfill-corejs3", { "method": "entry-global", "version": "3.50.0" }],
            // Babel 8 removed transform-runtime's `regenerator` option; this plugin
            // injects the regenerator import in its place.
            // "usage-pure", not "entry-global": this replaces transform-runtime's
            // `regenerator: true`, which injected the helper from @babel/runtime rather
            // than polluting globals. The corejs3 plugin above uses "entry-global"
            // because it replaces preset-env's `useBuiltIns: "entry"`, which did.
            ["polyfill-regenerator", { "method": "usage-pure" }],
            // No `regenerator: true` -- Babel 8 removed the option; the plugin above does it.
            //
            // Also gone from this list: @babel/plugin-syntax-import-attributes. Babel 8 parses
            // import attributes (`with { type: "json" }`) natively, and that plugin has no
            // stable 8.x, so keeping it would have pinned the whole toolchain to Babel 7.
            "@babel/plugin-transform-runtime"
        ]
    };
};
