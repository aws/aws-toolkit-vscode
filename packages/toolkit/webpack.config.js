/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('path')
const currentDir = process.cwd()

const baseConfig = require('../webpack.base.config')
const baseBrowserConfig = require('../webpack.browser.config')

const config = {
    ...baseConfig,
    entry: {
        'src/main': './src/main.ts',
    },
}

const serveConfig = {
    ...config,
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
    externals: {
        vscode: 'commonjs vscode',
    },
}

const browserConfig = {
    ...baseBrowserConfig,
    entry: {
        'src/mainWeb': './src/mainWeb.ts',
    },
}

const browserServeConfig = {
    ...browserConfig,
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
}

module.exports = [serveConfig, browserServeConfig]
