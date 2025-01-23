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
const { merge } = require('webpack-merge')
const baseConfigFactory = require('./webpack.base.config')

module.exports = (env, argv) => {
    const baseConfig = baseConfigFactory(env, argv)
    const isDevelopment = argv.mode === 'development'

    /** @type WebpackConfig */
    const config = merge(baseConfig, {
        name: 'webBase',
        target: 'webworker',
        devtool: isDevelopment ? 'inline-source-map' : undefined,
        plugins: [
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
            /**
             * HACK: the HttpResourceFetcher breaks Web mode if imported, BUT we still dynamically import this module for non web mode
             * environments. The following allows compilation to pass in Web mode by never bundling the module in the final output for web mode.
             */
            new webpack.IgnorePlugin({
                resourceRegExp: /httpResourceFetcher/, // matches the path in the require() statement
            }),
            /**
             * HACK: the ps-list module breaks Web mode if imported, BUT we still dynamically import this module for non web mode
             * environments. The following allows compilation to pass by never bundling the module in the final output for web mode.
             */
            new webpack.IgnorePlugin({
                resourceRegExp: /ps-list/, // matches the path in the require() statement
            }),
        ],
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
                perf_hooks: false, // should be using globalThis.performance instead

                // *** If one of these modules actually gets used an error will be raised ***
                // You may see something like: "TypeError: path_ignored_0.join is not a function"

                // We don't need these yet, but as we start enabling functionality in the web
                // we may need to polyfill.
                http: false, // http: require.resolve('stream-http'),
                https: false, // https: require.resolve('https-browserify'),
                zlib: false, // zlib: require.resolve('browserify-zlib'),
                constants: false, // constants: require.resolve('constants-browserify'),
                // These do not have a straight forward replacement
                child_process: false, // Reason for error: 'TypeError: The "original" argument must be of type Function'
                async_hooks: false,
                net: false,
            },
        },
        optimization: {
            // If `true` then we will get confusing variable names in the debugging menu
            minimize: !isDevelopment,
        },
    })

    return config
}
