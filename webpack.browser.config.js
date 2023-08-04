/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
const webpack = require('webpack')
var { FilerWebpackPlugin } = require('filer/webpack')

const configs = require('./webpack.config')
const baseConfig = configs.filter(c => c.name === 'main')[0]

/** @type WebpackConfig */
const webConfig = {
    ...baseConfig,
    name: 'web',
    target: 'webworker',
    entry: {
        'src/extensionWeb': './src/extensionWeb.ts',
    },
    plugins: (baseConfig.plugins ?? []).concat(
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1, // disable chunks by default since web extensions must be a single bundle
        }),
        // some modules are provided globally and dont require an explicit import,
        // so we need to polyfill them using this method
        new webpack.ProvidePlugin({
            process: require.resolve('process/browser'),
            Buffer: ['buffer', 'Buffer'],
        }),
        new webpack.EnvironmentPlugin({
            NODE_DEBUG: 'development',
            READABLE_STREAM: 'disable',
        }),
        // polyfills global 'fs' and 'path'
        new FilerWebpackPlugin()
    ),
    resolve: {
        extensions: ['.ts', '.js'],
        fallback: {
            stream: require.resolve('stream-browserify'),
            os: require.resolve('os-browserify/browser'),
            path: require.resolve('path-browserify'),

            // *** If one of these modules actually gets used an error will be raised ***
            // You may see something like: "TypeError: path_ignored_0.join is not a function"

            // We don't need these yet, but as we start enabling functionality in the web
            // we may need to polyfill.
            http: false, // http: require.resolve('stream-http'),
            https: false, // https: require.resolve('https-browserify'),
            zlib: false, // zlib: require.resolve('browserify-zlib'),
            assert: false, // assert: require.resolve('assert/'),
            constants: false, //constants: require.resolve('constants-browserify'),
            crypto: false, // crypto: require.resolve('crypto-browserify'),
            // These do not have a straight forward replacement
            child_process: false, // Reason for error: 'TypeError: The "original" argument must be of type Function'
            async_hooks: false,
        },
    },
    optimization: {
        minimize: false,
    },
}

module.exports = [webConfig]
