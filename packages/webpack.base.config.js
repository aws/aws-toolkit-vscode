/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-check

'use strict'

const path = require('path')
const webpack = require('webpack')
const { ESBuildMinifyPlugin } = require('esbuild-loader')
const fs = require('fs')
const { NLSBundlePlugin } = require('vscode-nls-dev/lib/webpack-bundler')
const CircularDependencyPlugin = require('circular-dependency-plugin')

// Webpack must run from subproject/package dir.
const currentDir = process.cwd()
const packageJsonFile = path.join(currentDir, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'))
const packageId = `${packageJson.publisher}.${packageJson.name}`

// @ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

module.exports = (env = {}, argv = {}) => {
    const isDevelopment = argv.mode === 'development'
    /** @type WebpackConfig */
    const baseConfig = {
        name: 'main',
        target: 'node',
        output: {
            path: path.resolve(currentDir, 'dist'),
            filename: '[name].js',
            libraryTarget: 'commonjs2',
        },
        devtool: isDevelopment ? 'source-map' : undefined,
        externals: {
            vscode: 'commonjs vscode',
            vue: 'root Vue',
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: {
                // Forces webpack to resolve the `main` (cjs) entrypoint
                //
                // This is only necessary because of issues with transitive dependencies
                // `umd-compat-loader` cannot handle ES2018 syntax which is used in later versions of `vscode-json-languageservice`
                // But, for whatever reason, the ESM output is used if we don't explicitly set `mainFields` under webpack's `resolve`
                '@aws/fully-qualified-names$': '@aws/fully-qualified-names/node/aws_fully_qualified_names.js',
            },
            fallback: {
                /**
                 * required by xml2js otherwise we get:
                 * BREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default.
                 * This is no longer the case. Verify if you need this module and configure a polyfill for it.
                 */
                timers: false,
            },
        },
        node: {
            __dirname: false, // preserve the default node.js behavior for __dirname
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules|testFixtures/,
                    use: [
                        // This creates nls-metadata.json in dist/, but we don't need this functionality currently.
                        // If we want to have language locale support later we should look to re-enable this.
                        // This was disabled since it caused issues with the browser version of the toolkit.
                        // THe localize() func does not work in the browser when used this loader, we got
                        // the error from
                        // https://github.com/microsoft/vscode-nls/blob/6f88c23c3ab630e9d4c60f65ed33839bd4a0cec2/src/browser/main.ts#L15
                        // Now, with this disabled we do not create externalized strings.
                        // {
                        //     loader: require.resolve('vscode-nls-dev/lib/webpack-loader'),
                        //     options: {
                        //         base: path.join(__dirname, 'src'),
                        //     },
                        // },
                        {
                            // This transpiles our typescript to javascript.
                            loader: 'esbuild-loader',
                            options: {
                                loader: 'ts',
                                target: 'es2021',
                            },
                        },
                    ],
                },
                {
                    test: /node_modules[\\|/](amazon-states-language-service|vscode-json-languageservice)/,
                    use: { loader: 'umd-compat-loader' },
                },
            ],
        },
        plugins: [
            new NLSBundlePlugin(packageId),
            new webpack.DefinePlugin({
                EXTENSION_VERSION: JSON.stringify(packageJson.version),
            }),
            new webpack.DefinePlugin({
                __VUE_OPTIONS_API__: 'true',
                __VUE_PROD_DEVTOOLS__: 'false',
            }),
            new CircularDependencyPlugin({
                exclude: /node_modules|testFixtures/,
                failOnError: true,
            }),
        ],
        optimization: {
            minimize: !isDevelopment,
            minimizer: [
                new ESBuildMinifyPlugin({
                    target: 'es2021',
                    // Are these enabled by default?
                    // minify: true,
                    // treeShaking: true,

                    // De-duplicate license headers and list them at end of file.
                    legalComments: 'eof',
                    // sourcemap: 'external',
                }),
            ],
        },
    }
    return baseConfig
}
