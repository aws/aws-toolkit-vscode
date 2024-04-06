/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the final webpack config that collects all webpack configs.
 */

const baseConfigFactory = require('../webpack.base.config')
const baseVueConfigFactory = require('../webpack.vue.config')
const baseWebConfig = require('../webpack.web.config')

module.exports = (env, argv) => {
    const baseVueConfig = baseVueConfigFactory(env, argv)
    const baseConfig = baseConfigFactory(env, argv)

    const config = {
        ...baseConfig,
        entry: {
            'src/stepFunctions/asl/aslServer': './src/stepFunctions/asl/aslServer.ts',
        },
    }

    const vueConfig = {
        ...baseVueConfig.config,
        // Inject entry point into all configs.
        entry: {
            ...baseVueConfig.utils.createVueEntries(),
            'src/amazonq/webview/ui/amazonq-ui': './src/amazonq/webview/ui/main.ts',
        },
    }

    const WebConfig = {
        ...baseWebConfig,
        entry: {
            'src/extensionWeb': './src/extensionWeb.ts',
            'src/testWeb/testRunner': './src/testWeb/testRunner.ts',
        },
    }

    return [config, vueConfig, WebConfig]
}
