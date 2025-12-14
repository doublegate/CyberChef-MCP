module.exports = function(api) {
    api.cache.forever();

    return {
        "presets": [
            ["@babel/preset-env", {
                "modules": false,
                "useBuiltIns": "entry",
                "corejs": 3
            }]
        ],
        "plugins": [
            "dynamic-import-node",
            ["@babel/plugin-syntax-import-attributes", { "deprecatedAssertSyntax": true }],
            [
                "@babel/plugin-transform-runtime", {
                    "regenerator": true
                }
            ]
        ]
    };
};
