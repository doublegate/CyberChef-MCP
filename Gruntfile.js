"use strict";

const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const { codecovWebpackPlugin } = require("@codecov/webpack-plugin");
const glob = require("glob");
const path = require("path");

const nodeFlags = "--experimental-modules --experimental-json-modules --experimental-specifier-resolution=node --no-warnings --no-deprecation";

/**
 * Grunt configuration for building the app in various formats.
 *
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2017
 * @license Apache-2.0
 */

module.exports = function (grunt) {
    grunt.file.defaultEncoding = "utf8";
    grunt.file.preserveBOM = false;

    // Tasks
    // The web-app build tasks are GONE, not broken-in-place.
    //
    // This fork removed the CyberChef web application in v1.7.1; `src/web/` kept eight orphaned
    // files that nothing imported, and the templates and stylesheets the build needs
    // (src/web/html/index.html, src/web/stylesheets/, src/web/static/ga.html) went with it. So
    // `grunt prod` had not produced a build since v1.7.1 -- it failed with 39 webpack errors,
    // measured before removing it.
    //
    // A task that cannot succeed is worse than an absent one: it invites someone to debug a build
    // for a product this repository does not ship. These now say so immediately.
    // `grunt.fail.fatal` -- exits NON-ZERO -- rather than a log line.
    //
    // Raised in review, and the reasoning is right: before this change `grunt prod` FAILED, with 39
    // webpack errors. A stub that prints a message and exits 0 would turn an outdated caller from
    // red to green while it still produced nothing, which is a worse outcome than the broken build
    // it replaced. The point of removing the task is to say "this does not exist", and a build
    // command that does not build must not report success.
    const webAppRemoved = (name) => grunt.registerTask(name,
        `Removed: this fork ships an MCP server, not the CyberChef web app (dropped in v1.7.1).`,
        function () {
            grunt.fail.fatal(
                `"${name}" built the CyberChef web application, which this fork removed in v1.7.1.\n` +
                "  Run the MCP server:            npm run mcp\n" +
                "  Build the container:           docker build -f Dockerfile.mcp -t cyberchef-mcp .\n" +
                "  Regenerate operation config:   npm run build   (npx grunt configTests)");
        });
    webAppRemoved("dev");
    webAppRemoved("prod");

    grunt.registerTask("node",
        "Compiles CyberChef into a single NodeJS module.",
        [
            "clean:node", "clean:config", "clean:nodeConfig", "exec:generateConfig", "exec:generateNodeIndex"
        ]);

    grunt.registerTask("configTests",
        "A task which configures config files in preparation for tests to be run. Use `npm test` to run tests.",
        [
            "clean:config", "clean:nodeConfig", "exec:generateConfig", "exec:generateNodeIndex"
        ]);

    grunt.registerTask("testnodeconsumer",
        "A task which checks whether consuming CJS and ESM apps work with the CyberChef build",
        ["exec:setupNodeConsumers", "exec:testCJSNodeConsumer", "exec:testESMNodeConsumer", "exec:teardownNodeConsumers"]);

    grunt.registerTask("default",
        "Lints the code base",
        ["eslint", "exec:repoSize"]);

    grunt.registerTask("lint", "eslint");

    grunt.registerTask("findModules",
        "Finds all generated modules and updates the entry point list for Webpack",
        function(arg1, arg2) {
            const moduleEntryPoints = listEntryModules();

            grunt.log.writeln(`Found ${Object.keys(moduleEntryPoints).length} modules.`);

            grunt.config.set("webpack.web.entry",
                Object.assign({
                    main: "./src/web/index.js"
                }, moduleEntryPoints));
        });


    grunt.registerTask("chmod",
        "Sets file permissions on build output using native fs",
        function() {
            const done = this.async();
            const fs = require("fs");
            const buildPath = path.resolve("build");
            /**
             * Recursively sets 755 permissions on a directory and its contents.
             *
             * @param {string} dir - Directory path to chmod
             */
            function chmodRecursive(dir) {
                if (!fs.existsSync(dir)) return;
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    fs.chmodSync(fullPath, 0o755);
                    if (entry.isDirectory()) {
                        chmodRecursive(fullPath);
                    }
                }
                fs.chmodSync(dir, 0o755);
            }
            try {
                chmodRecursive(buildPath);
                grunt.log.ok("Set permissions 755 on build/**/*");
                done();
            } catch (err) {
                grunt.log.error("chmod failed: " + err.message);
                done(false);
            }
        });


    // Load tasks provided by each plugin
    grunt.loadNpmTasks("grunt-eslint");
    grunt.loadNpmTasks("grunt-webpack");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-contrib-watch");
    grunt.loadNpmTasks("grunt-exec");
    grunt.loadNpmTasks("grunt-concurrent");
    grunt.loadNpmTasks("grunt-zip");


    // Project configuration
    const compileYear = grunt.template.today("UTC:yyyy"),
        compileTime = grunt.template.today("UTC:dd/mm/yyyy HH:MM:ss") + " UTC",
        pkg = grunt.file.readJSON("package.json"),
        webpackConfig = require("./webpack.config.js"),
        BUILD_CONSTANTS = {
            COMPILE_YEAR: JSON.stringify(compileYear),
            COMPILE_TIME: JSON.stringify(compileTime),
            COMPILE_MSG: JSON.stringify(grunt.option("compile-msg") || grunt.option("msg") || ""),
            PKG_VERSION: JSON.stringify(pkg.version),
        },
        moduleEntryPoints = listEntryModules(),
        nodeConsumerTestPath = "~/tmp-cyberchef",
        /**
         * Configuration for Webpack production build. Defined as a function so that it
         * can be recalculated when new modules are generated.
         */
        webpackProdConf = () => {
            return {
                mode: "production",
                target: "web",
                entry: Object.assign({
                    main: "./src/web/index.js"
                }, moduleEntryPoints),
                output: {
                    path: __dirname + "/build/prod",
                    filename: chunkData => {
                        return chunkData.chunk.name === "main" ? "assets/[name].js": "[name].js";
                    },
                    globalObject: "this"
                },
                resolve: {
                    alias: {
                        "./config/modules/OpModules.mjs": "./config/modules/Default.mjs"
                    }
                },
                plugins: [
                    new webpack.DefinePlugin(BUILD_CONSTANTS),
                    new HtmlWebpackPlugin({
                        filename: "index.html",
                        template: "./src/web/html/index.html",
                        chunks: ["main"],
                        compileYear: compileYear,
                        compileTime: compileTime,
                        version: pkg.version,
                        minify: {
                            removeComments: true,
                            collapseWhitespace: true,
                            minifyJS: true,
                            minifyCSS: true
                        }
                    }),
                    new BundleAnalyzerPlugin({
                        analyzerMode: "static",
                        reportFilename: "BundleAnalyzerReport.html",
                        openAnalyzer: false,
                        logLevel: "warn",  // Don't fail on errors
                        generateStatsFile: false
                    }),
                    // Codecov Bundle Analysis Plugin
                    codecovWebpackPlugin({
                        enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
                        bundleName: "cyberchef-mcp-bundle",
                        uploadToken: process.env.CODECOV_TOKEN,
                        gitService: "github",
                        dryRun: process.env.CODECOV_TOKEN === undefined,  // Dry run if no token
                    }),
                ]
            };
        };


    /**
     * Generates an entry list for all the modules.
     */
    function listEntryModules() {
        const entryModules = {};

        glob.sync("./src/core/config/modules/*.mjs").forEach(file => {
            const basename = path.basename(file);
            if (basename !== "Default.mjs" && basename !== "OpModules.mjs")
                entryModules["modules/" + basename.split(".mjs")[0]] = path.resolve(file);
        });

        return entryModules;
    }

    /**
     * Detects the correct delimiter to use to chain shell commands together
     * based on the current OS.
     *
     * @param {string[]} cmds
     * @returns {string}
     */
    function chainCommands(cmds) {
        const win = process.platform === "win32";
        if (!win) {
            // `&&`, NOT `;`. With `;` every command runs regardless of the previous one's exit
            // status AND the chain's status is the LAST command's -- which here is always a
            // trailing `echo`. So a config-generation script could die and `grunt configTests`
            // would still exit 0, leaving OperationConfig.json as the literal `[]` written by the
            // first command: an MCP server with zero tools, from a build that reported success.
            //
            // Observed twice. During the v11.4.0 landing a missing generator killed
            // generateConfig silently, and again here when `bson` 7 removed its default export.
            // Both times grunt said "Done." Verified:
            //     (true ; false ; echo done)  -> exit 0
            //     (true && false && echo done) -> exit 1
            //
            // Note the Windows branch below already used `&&` and its comment explains exactly
            // why -- so POSIX was the odd one out, failing open where Windows failed closed.
            return cmds.join(" && ");
        }
        return cmds
            // && means that subsequent commands will not be executed if the
            // previous one fails. & would coninue on a fail
            .join("&&")
            // Windows does not support \n properly
            .replace(/\n/g, "\\n");
    }

    grunt.initConfig({
        clean: {
            dev: ["build/dev/*"],
            prod: ["build/prod/*"],
            node: ["build/node/*"],
            config: ["src/core/config/OperationConfig.json", "src/core/config/modules/*", "src/code/operations/index.mjs"],
            nodeConfig: ["src/node/index.mjs", "src/node/config/OperationConfig.json"],
            standalone: ["build/prod/CyberChef*.html"]
        },
        eslint: {
            configs: ["*.{js,mjs}"],
            core: ["src/core/**/*.{js,mjs}", "!src/core/vendor/**/*", "!src/core/operations/legacy/**/*"],
            node: ["src/node/**/*.{js,mjs}", "!src/node/index.mjs"],
            tests: ["tests/**/*.{js,mjs}"],
        },
        webpack: {
            options: webpackConfig,
            myConfig: webpackConfig,
            web: webpackProdConf(),
        },
        "webpack-dev-server": {
            options: webpackConfig,
            start: {
                mode: "development",
                target: "web",
                entry: Object.assign({
                    main: "./src/web/index.js"
                }, moduleEntryPoints),
                resolve: {
                    alias: {
                        "./config/modules/OpModules.mjs": "./config/modules/Default.mjs"
                    }
                },
                devServer: {
                    port: grunt.option("port") || 8080,
                    client: {
                        logging: "error",
                        overlay: true
                    },
                    hot: "only"
                },
                plugins: [
                    new webpack.DefinePlugin(BUILD_CONSTANTS),
                    new HtmlWebpackPlugin({
                        filename: "index.html",
                        template: "./src/web/html/index.html",
                        chunks: ["main"],
                        compileYear: compileYear,
                        compileTime: compileTime,
                        version: pkg.version,
                    })
                ]
            }
        },
        zip: {
            standalone: {
                cwd: "build/prod/",
                src: [
                    "build/prod/**/*",
                    "!build/prod/index.html",
                    "!build/prod/BundleAnalyzerReport.html",
                ],
                dest: `build/prod/CyberChef_v${pkg.version}.zip`
            }
        },
        copy: {
            ghPages: {
                options: {
                    process: function (content, srcpath) {
                        if (srcpath.indexOf("index.html") >= 0) {
                            // Add Google Analytics code to index.html
                            content = content.replace("</body></html>",
                                grunt.file.read("src/web/static/ga.html") + "</body></html>");

                            // Add Structured Data for SEO
                            content = content.replace("</head>",
                                "<script type='application/ld+json'>" +
                                JSON.stringify(JSON.parse(grunt.file.read("src/web/static/structuredData.json"))) +
                                "</script></head>");
                            return grunt.template.process(content, srcpath);
                        } else {
                            return content;
                        }
                    },
                    noProcess: ["**", "!**/*.html"]
                },
                files: [
                    {
                        src: ["build/prod/index.html"],
                        dest: "build/prod/index.html"
                    }
                ]
            },
            standalone: {
                options: {
                    process: function (content, srcpath) {
                        if (srcpath.indexOf("index.html") >= 0) {
                            // Replace download link with version number
                            content = content.replace(/<a [^>]+>Download CyberChef.+?<\/a>/,
                                `<span>Version ${pkg.version}</span>`);

                            return grunt.template.process(content, srcpath);
                        } else {
                            return content;
                        }
                    },
                    noProcess: ["**", "!**/*.html"]
                },
                files: [
                    {
                        src: ["build/prod/index.html"],
                        dest: `build/prod/CyberChef_v${pkg.version}.html`
                    }
                ]
            }
        },
        // chmod replaced by custom 'chmod' task registered below
        watch: {
            config: {
                files: ["src/core/operations/**/*", "!src/core/operations/index.mjs"],
                tasks: ["exec:generateNodeIndex", "exec:generateConfig"]
            }
        },
        concurrent: {
            dev: ["watch:config", "webpack-dev-server:start"],
            options: {
                logConcurrentOutput: true
            }
        },
        exec: {
            calcDownloadHash: {
                command: function () {
                    switch (process.platform) {
                        case "darwin":
                            return chainCommands([
                                `shasum -a 256 build/prod/CyberChef_v${pkg.version}.zip | awk '{print $1;}' > build/prod/sha256digest.txt`,
                                `sed -i '' -e "s/DOWNLOAD_HASH_PLACEHOLDER/$(cat build/prod/sha256digest.txt)/" build/prod/index.html`
                            ]);
                        default:
                            return chainCommands([
                                `sha256sum build/prod/CyberChef_v${pkg.version}.zip | awk '{print $1;}' > build/prod/sha256digest.txt`,
                                `sed -i -e "s/DOWNLOAD_HASH_PLACEHOLDER/$(cat build/prod/sha256digest.txt)/" build/prod/index.html`
                            ]);
                    }
                },
            },
            repoSize: {
                command: chainCommands([
                    "git ls-files | wc -l | xargs printf '\n%b\ttracked files\n'",
                    "du -hs | egrep -o '^[^\t]*' | xargs printf '%b\trepository size\n'"
                ]),
                stderr: false
            },
            cleanGit: {
                command: "git gc --prune=now --aggressive"
            },
            sitemap: {
                command: `node ${nodeFlags} src/web/static/sitemap.mjs > build/prod/sitemap.xml`,
                sync: true
            },
            generateConfig: {
                command: chainCommands([
                    "echo '\n--- Regenerating config files. ---'",
                    "echo [] > src/core/config/OperationConfig.json",
                    // Added for upstream v11.4.0, which introduced a SIXTH generated file:
                    // src/core/lib/HTMLEntities.mjs, gitignored upstream and produced here.
                    // Without this, FromHTMLEntity.mjs imports a module that does not exist and
                    // generateConfig dies -- leaving OperationConfig.json as the literal `[]`
                    // written on the line above, i.e. an MCP server with zero tools.
                    `node ${nodeFlags} src/core/config/scripts/generateHTMLEntities.mjs`,
                    `node ${nodeFlags} src/core/config/scripts/generateOpsIndex.mjs`,
                    `node ${nodeFlags} src/core/config/scripts/generateConfig.mjs`,
                    "echo '--- Config scripts finished. ---\n'"
                ]),
                sync: true
            },
            generateNodeIndex: {
                command: chainCommands([
                    "echo '\n--- Regenerating node index ---'",
                    `node ${nodeFlags} src/node/config/scripts/generateNodeIndex.mjs`,
                    "echo '--- Node index generated. ---\n'"
                ]),
                sync: true
            },
            setupNodeConsumers: {
                command: chainCommands([
                    "echo '\n--- Testing node consumers ---'",
                    "npm link",
                    `mkdir ${nodeConsumerTestPath}`,
                    `cp tests/node/consumers/* ${nodeConsumerTestPath}`,
                    `cd ${nodeConsumerTestPath}`,
                    "npm link cyberchef"
                ]),
                sync: true
            },
            teardownNodeConsumers: {
                command: chainCommands([
                    `rm -rf ${nodeConsumerTestPath}`,
                    "echo '\n--- Node consumer tests complete ---'"
                ]),
            },
            testCJSNodeConsumer: {
                command: chainCommands([
                    `cd ${nodeConsumerTestPath}`,
                    `node ${nodeFlags} cjs-consumer.js`,
                ]),
                stdout: false,
            },
            testESMNodeConsumer: {
                command: chainCommands([
                    `cd ${nodeConsumerTestPath}`,
                    `node ${nodeFlags} esm-consumer.mjs`,
                ]),
                stdout: false,
            },
            fixCryptoApiImports: {
                command: function () {
                    switch (process.platform) {
                        case "darwin":
                            return `find ./node_modules/crypto-api/src/ \\( -type d -name .git -prune \\) -o -type f -print0 | xargs -0 sed -i '' -e '/\\.mjs/!s/\\(from "\\.[^"]*\\)";/\\1.mjs";/g'`;
                        default:
                            return `find ./node_modules/crypto-api/src/ \\( -type d -name .git -prune \\) -o -type f -print0 | xargs -0 sed -i -e '/\\.mjs/!s/\\(from "\\.[^"]*\\)";/\\1.mjs";/g'`;
                    }
                },
                stdout: false
            },
            fixSnackbarMarkup: {
                command: function () {
                    switch (process.platform) {
                        case "darwin":
                            return `sed -i '' 's/<div id=snackbar-container\\/>/<div id=snackbar-container>/g' ./node_modules/snackbarjs/src/snackbar.js`;
                        default:
                            return `sed -i 's/<div id=snackbar-container\\/>/<div id=snackbar-container>/g' ./node_modules/snackbarjs/src/snackbar.js`;
                    }
                },
                stdout: false
            },
            fixJimpModule: {
                command: function () {
                    switch (process.platform) {
                        case "darwin":
                            // Space added before comma to prevent multiple modifications
                            return `sed -i '' 's/"es\\/index.js",/"es\\/index.js" ,\\n  "type": "module",/' ./node_modules/jimp/package.json`;
                        default:
                            return `sed -i 's/"es\\/index.js",/"es\\/index.js" ,\\n  "type": "module",/' ./node_modules/jimp/package.json`;
                    }
                },
                stdout: false
            },
            fixSerializeJavascript: {
                command: "node scripts/fix-serialize-javascript.js",
                stdout: false
            },
            fixLoglevelMessagePrefix: {
                command: function () {
                    switch (process.platform) {
                        case "darwin":
                            return `sed -i '' 's/@natlibfi(es6-polyfills/@natlibfi\\/es6-polyfills/g' ./node_modules/@natlibfi/loglevel-message-prefix/lib/main.js`;
                        default:
                            return `sed -i 's/@natlibfi(es6-polyfills/@natlibfi\\/es6-polyfills/g' ./node_modules/@natlibfi/loglevel-message-prefix/lib/main.js`;
                    }
                },
                stdout: false
            }
        },
    });
};
