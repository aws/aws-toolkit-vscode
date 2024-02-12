/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This config exists separately so it can be invoked from the webpack CLI.
 */

const browserConfig = {
    ...require('../webpack.browser.config'),
    entry: {
        'src/extensionWeb': './src/extensionWeb.ts',
    },
}

module.exports = browserConfig
