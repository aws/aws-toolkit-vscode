/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path')
const baseConfig = require('./webpack.base.config')

/** @type WebpackConfig */
const webviewConfig = {
    ...baseConfig,
    target: ['web', 'es2020'],
    entry: {
        'src/webview': './src/webview.ts',
    },
    experiments: { outputModule: true },
    output: {
        ...baseConfig.output,
        libraryTarget: 'module',
        chunkFormat: 'module',
    },
    optimization: {},
    plugins: [],
}

module.exports = webviewConfig
