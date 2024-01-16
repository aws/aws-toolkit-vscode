/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

'use strict'

const path = require('path')
const webpack = require('webpack')
const { ESBuildMinifyPlugin } = require('esbuild-loader')
const fs = require('fs')
const { NLSBundlePlugin } = require('vscode-nls-dev/lib/webpack-bundler')
const CircularDependencyPlugin = require('circular-dependency-plugin')
const packageJsonFile = path.join(__dirname, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'))
const packageId = `${packageJson.publisher}.${packageJson.name}`

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const baseConfig = {
    name: 'main',
    target: 'node',
    entry: {
        'src/main': './src/main.ts',
        'src/stepFunctions/asl/aslServer': './src/stepFunctions/asl/aslServer.ts',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: 'commonjs2',
    },
    devtool: 'source-map',
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
    },
    node: {
        __dirname: false, //preserve the default node.js behavior for __dirname
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
        new CircularDependencyPlugin({
            exclude: /node_modules|testFixtures/,
            failOnError: true,
        }),
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new ESBuildMinifyPlugin({
                target: 'es2021',
            }),
        ],
    },
}

module.exports = baseConfig
