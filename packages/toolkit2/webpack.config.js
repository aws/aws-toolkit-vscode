/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the final webpack config that collects all webpack configs.
 */
const path = require('path')
const { VueLoaderPlugin } = require('vue-loader')

const baseConfig = require('../webpack.base.config')
// const baseVueConfig = require('../webpack.vue.config')
// const baseBrowserConfig = require('../webpack.browser.config')

const config = {
    ...baseConfig,
    entry: {
        'src/main': './src/main.ts',
    },
}

// const browserConfig = {
//     ...baseBrowserConfig,
//     entry: {
//         'src/mainWeb': './src/mainWeb.ts',
//     },
// }

module.exports = [config] //, browserConfig]//]
