/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file contains code originally from https://github.com/jeanp413/open-remote-ssh
 * Original copyright: (c) 2022
 * Originally released under MIT license
 */

'use strict'

const baseConfigFactory = require('../webpack.base.config')
const webpack = require('webpack')

module.exports = (env, argv) => {
    const baseConfig = baseConfigFactory(env, argv)

    const config = {
        ...baseConfig,
        entry: {
            extension: './src/extension.ts',
        },
        externals: {
            ...baseConfig.externals,
            bufferutil: 'bufferutil',
            'utf-8-validate': 'utf-8-validate',
        },
        plugins: [
            ...(baseConfig.plugins || []),
            new webpack.IgnorePlugin({
                resourceRegExp: /crypto\/build\/Release\/sshcrypto\.node$/,
            }),
            new webpack.IgnorePlugin({
                resourceRegExp: /cpu-features/,
            }),
        ],
    }

    return config
}
