/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Notes:
 *
 * Followed guide from: https://code.visualstudio.com/api/extension-guides/web-extensions#webpack-configuration
 *
 */
const webpack = require('webpack')

const baseConfig = require('./webpack.base.config')

/** @type WebpackConfig */
const webConfig = {
    ...baseConfig,
    name: 'web',
    target: 'webworker',
    /**
     * The keys in the following 'entry' object are the relative paths of the final output files in 'dist'.
     * They are suffixed with '.js' implicitly.
     */
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
        })
    ),
    resolve: {
        extensions: ['.ts', '.js'],
        fallback: {
            stream: require.resolve('stream-browserify'),
            os: require.resolve('os-browserify/browser'),
            path: require.resolve('path-browserify'),
            assert: require.resolve('assert'),
            fs: false,
            crypto: require.resolve('crypto-browserify'),
            'fs-extra': false,

            // *** If one of these modules actually gets used an error will be raised ***
            // You may see something like: "TypeError: path_ignored_0.join is not a function"

            // We don't need these yet, but as we start enabling functionality in the web
            // we may need to polyfill.
            http: false, // http: require.resolve('stream-http'),
            https: false, // https: require.resolve('https-browserify'),
            zlib: false, // zlib: require.resolve('browserify-zlib'),
            constants: false, //constants: require.resolve('constants-browserify'),
            // These do not have a straight forward replacement
            child_process: false, // Reason for error: 'TypeError: The "original" argument must be of type Function'
            async_hooks: false,
        },
    },
    mode: 'production', // lets see if we can change this to 'development' later
    optimization: {
        minimize: false,
    },
}

module.exports = webConfig
