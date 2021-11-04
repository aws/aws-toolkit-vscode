/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

'use strict'

const path = require('path')
const glob = require('glob')
const webpack = require('webpack')
const { ESBuildMinifyPlugin } = require('esbuild-loader')
const fs = require('fs')
const { NLSBundlePlugin } = require('vscode-nls-dev/lib/webpack-bundler')
const CircularDependencyPlugin = require('circular-dependency-plugin')
const packageJsonFile = path.join(__dirname, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'))
const packageId = `${packageJson.publisher}.${packageJson.name}`
const { VueLoaderPlugin } = require('vue-loader')

/**@type {import('webpack').Configuration}*/
const baseConfig = {
    name: 'main',
    target: 'node',
    entry: {
        extension: './src/extension.ts',
        'src/stepFunctions/asl/aslServer': './src/stepFunctions/asl/aslServer.ts',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode',
        vue: 'root Vue',
    },
    resolve: {
        extensions: ['.ts', '.js'],
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
                    {
                        // vscode-nls-dev loader:
                        // * rewrite nls-calls
                        loader: 'vscode-nls-dev/lib/webpack-loader',
                        options: {
                            base: path.join(__dirname, 'src'),
                        },
                    },
                    {
                        loader: 'esbuild-loader',
                        options: {
                            loader: 'ts',
                            target: 'es2018',
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
                target: 'es2018',
            }),
        ],
    },
}

/**
 * Generates a name given a filepath to an entry file.
 * Example: `src/lambda/vue/entry.ts` -> `lambdaVue.js`
 * @param {string} file
 */
const createVueBundleName = file => {
    return path
        .relative('src', path.dirname(file))
        .split(path.sep)
        .filter(s => s !== 'vue')
        .map((s, i) => (i ? s.charAt(0).toUpperCase().concat(s.slice(1)) : s))
        .concat('Vue')
        .join('')
}

/**
 * Generates Vue entry points if the filename is called `entry.ts` and is under a `vue` directory.
 */
const createVueEntries = () => {
    return glob
        .sync(path.resolve(__dirname, 'src', '**', 'vue', '**', 'entry.ts'))
        .map(f => ({ name: createVueBundleName(f), path: f }))
        .reduce((a, b) => ((a[b.name] = b.path), a), {})
}

const vueConfig = {
    ...baseConfig,
    name: 'vue',
    target: 'web',
    entry: createVueEntries(),
    module: {
        rules: baseConfig.module.rules.concat(
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
            {
                test: /\.css$/,
                use: ['vue-style-loader', 'css-loader'],
            }
        ),
    },
    plugins: baseConfig.plugins.concat(new VueLoaderPlugin()),
}

const vueHotReload = {
    ...vueConfig,
    name: 'vue-hmr',
    devServer: {
        static: {
            directory: path.resolve(__dirname, 'dist'),
        },
        // This is not ideal, but since we're only running the server locally it's not too bad
        // The webview debugger tries to establish a websocket with a GUID as its origin, so not much of a workaround
        allowedHosts: 'all',
    },
    // Normally we want to exclude Vue from the bundle, but for hot reloads we need it
    externals: {
        vscode: 'commonjs vscode',
    },
}

module.exports =
    process.env.npm_lifecycle_event === 'serve' ? [baseConfig, vueConfig, vueHotReload] : [baseConfig, vueConfig]
