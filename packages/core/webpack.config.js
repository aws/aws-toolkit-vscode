/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This webpack config is used for everything else that the TypeScript transpilation does not do.
 *
 * Some things include:
 *   - Building the Web toolkit (Web extensions must be a single file, hence webpack)
 *   - Building Vue.js files for webviews
 */

const baseConfigFactory = require('../webpack.base.config')
const baseVueConfigFactory = require('../webpack.vue.config')
const baseWebConfigsFactory = require('../webpack.web.config')

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
            ...baseVueConfig.createVueEntries(),
            // The above `createVueEntries` path pattern match does not catch this:
            'src/amazonq/webview/ui/amazonq-ui': './src/amazonq/webview/ui/main.ts',
        },
    }

    const webConfig = {
        ...baseWebConfigsFactory(env, argv),
        entry: {
            // We webpack AND compile at the same time in certain build scripts.
            // Both webpack and compile can output the same named file, overwriting one another.
            // Due to this we must ensure the webpack `entry` files have a different
            // name from the actual source files so we do not overwrite the output
            // from the compilation.
            'src/extensionWebCore': './src/extensionWeb.ts',
            'src/testWeb/testRunnerWebCore': './src/testWeb/testRunner.ts',
        },
    }

    return [config, vueConfig, webConfig]
}
