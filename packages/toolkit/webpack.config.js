/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('path')
const currentDir = process.cwd()

const baseConfigFactory = require('../webpack.base.config')
const baseWebConfig = require('../webpack.web.config')

const baseConfig = baseConfigFactory()

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
        'src/main': './src/main.ts',
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

const webConfig = {
    ...baseWebConfig,
    entry: {
        'src/mainWeb': './src/mainWeb.ts',
    },
}

const webServeConfig = {
    ...webConfig,
    name: 'webServe',
    devServer,
}

module.exports = process.env.npm_lifecycle_event === 'serve' ? [serveConfig, webServeConfig] : [config, webConfig]
