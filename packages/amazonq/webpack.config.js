/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('path')
const currentDir = process.cwd()

const baseConfig = require('../webpack.base.config')

const devServer = {
    static: {
        directory: path.resolve(currentDir, 'dist'),
    },
    headers: {
        'Access-Control-Allow-Origin': '*',
    },
    allowedHosts: 'all',
}

const config = {
    ...baseConfig,
    entry: {
        'src/extension': './src/extension.ts',
    },
}

const serveConfig = {
    ...config,
    name: 'mainServe',
    devServer,
    externals: {
        vscode: 'commonjs vscode',
    },
}

module.exports = process.env.npm_lifecycle_event === 'serve' ? [serveConfig] : [config]
