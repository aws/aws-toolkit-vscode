/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the final webpack config that collects all webpack configs.
 */

const baseConfig = require('../webpack.base.config')
const baseVueConfig = require('../webpack.vue.config')
const baseWebConfig = require('../webpack.web.config')

const config = {
    ...baseConfig,
    entry: {
        'src/stepFunctions/asl/aslServer': './src/stepFunctions/asl/aslServer.ts',
    },
}

const vueConfigs = [baseVueConfig.configs.vue, baseVueConfig.configs.vueHotReload].map(c => {
    // Inject entry point into all configs.
    return {
        ...c,
        entry: {
            ...baseVueConfig.utils.createVueEntries(),
            'src/amazonq/webview/ui/amazonq-ui': './src/amazonq/webview/ui/main.ts',
        },
    }
})

const WebConfig = {
    ...baseWebConfig,
    entry: {
        'src/extensionWeb': './src/extensionWeb.ts',
        'src/testWeb/testRunner': './src/testWeb/testRunner.ts',
    },
}

module.exports = [config, ...vueConfigs, WebConfig]
