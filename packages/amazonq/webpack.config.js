/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const baseConfigFactory = require('../webpack.base.config')
const baseVueConfigFactory = require('../webpack.vue.config')

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

    return [config, vueConfig]
}
