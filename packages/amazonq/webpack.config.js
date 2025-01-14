/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const baseConfigFactory = require('../webpack.base.config')
const baseWebConfigsFactory = require('../webpack.web.config')

module.exports = (env, argv) => {
    const config = {
        ...baseConfigFactory(env, argv),
        entry: {
            'src/extensionNode': './src/extensionNode.ts',
        },
    }

    const webConfig = {
        ...baseWebConfigsFactory(env, argv),
        entry: {
            'src/extensionWeb': './src/extensionWeb.ts',
            'test/web/testRunnerWebCore': './test/web/testRunner.ts',
        },
    }

    return [config, webConfig]
}
