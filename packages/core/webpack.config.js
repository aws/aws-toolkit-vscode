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

    // We only need Web `core` to be webpacked/bundled for tests.
    // Separately, for Web `toolkit` we don't need the webpacked Web `core` code, so the following
    // will not return a Web `core` config.
    const webConfig =
        env.IS_WEB_CORE_TESTS === 'true'
            ? [
                  {
                      ...baseWebConfigsFactory(env, argv),
                      entry: {
                          // We need a different name (different from the file source file) since
                          // typescript compilation and webpack produce the same named file from the same source.
                          // If we don't do this, then one process will overwrite the others output.
                          // The following is used for testing purposes only.
                          'src/extensionWebTest': './src/extensionWeb.ts',
                          'src/testWeb/testRunner': './src/testWeb/testRunner.ts',
                      },
                  },
              ]
            : []

    return [config, vueConfig, ...webConfig]
}
