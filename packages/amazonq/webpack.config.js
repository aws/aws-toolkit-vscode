/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the final webpack config that collects all webpack configs.
 */

const baseConfigFactory = require('../webpack.base.config')
const baseVueConfigFactory = require('../webpack.vue.config')
const baseWebConfigFactory = require('../webpack.web.config')

module.exports = (env, argv) => {
    const config = {
        ...baseConfigFactory(env, argv),
        entry: {
            'src/extension': './src/extension.ts',
        },
    }

    const vue = baseVueConfigFactory(env, argv)
    const vueConfig = {
        ...vue.config,
        entry: {
            ...vue.createVueEntries(),
            //'src/amazonq/webview/ui/amazonq-ui': './src/amazonq/webview/ui/main.ts',
        },
    }

    const webConfig = {
        ...baseWebConfigFactory(env, argv),
        entry: {
            'src/extensionWeb': './src/extensionWeb.ts',
        },
    }

    return [config, vueConfig, webConfig]
}
