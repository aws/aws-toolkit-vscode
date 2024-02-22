/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

'use strict'

const path = require('path')
const glob = require('glob')
const { VueLoaderPlugin } = require('vue-loader')
const baseConfig = require('./webpack.base.config')
const currentDir = process.cwd()

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/**
 * Renames all Vue entry files to be `index`, located within the same directory.
 * Example: `src/lambda/vue/index.ts` -> `dist/src/lambda/vue/index.js`
 * @param {string} file
 */
const createVueBundleName = file => {
    return path.relative(currentDir, file).replace('src/', '').split('.').slice(0, -1).join(path.sep)
}

/**
 * Generates Vue entry points if the filename is matches `targetPattern` (default: index.ts)
 * and is under a `vue` directory.
 */
const createVueEntries = (dir = currentDir, targetPattern = 'index.ts') => {
    return glob
        .sync(path.resolve(currentDir, 'src', '**', 'vue', '**', targetPattern))
        .map(f => ({ name: createVueBundleName(f), path: f }))
        .reduce((a, b) => ((a[b.name] = b.path), a), {})
}

/** @type WebpackConfig */
const vueConfig = {
    ...baseConfig,
    name: 'vue',
    target: 'web',
    output: {
        path: path.resolve(currentDir, 'dist', 'vue'),
        libraryTarget: 'this',
    },
    module: {
        rules: (baseConfig.module?.rules ?? []).concat(
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
            {
                test: /\.css$/,
                use: ['vue-style-loader', 'css-loader'],
            },
            {
                test: /\.(png|jpg|gif|svg)$/,
                use: 'file-loader',
            },
            // sass loaders for Mynah
            { test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader'] }
        ),
    },
    plugins: (baseConfig.plugins ?? []).concat(new VueLoaderPlugin()),
}

/** @type WebpackConfig */
const vueHotReloadConfig = {
    ...vueConfig,
    name: 'vue-hmr',
    output: {
        path: path.resolve(currentDir, 'dist', 'vuehr'),
        libraryTarget: 'this',
    },
    devServer: {
        static: {
            directory: path.resolve(currentDir, 'dist'),
        },
        headers: {
            'Access-Control-Allow-Origin': '*',
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

module.exports = {
    configs: {
        vue: vueConfig,
        vueHotReload: vueHotReloadConfig,
    },
    utils: {
        createVueEntries,
    },
}
