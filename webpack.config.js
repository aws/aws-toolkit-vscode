/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the final webpack config that collects all webpack configs.
 */

const baseConfig = require('./webpack.base.config')
const vueConfigs = require('./webpack.vue.config')
const browserConfigs = require('./webpack.browser.config')

module.exports = [baseConfig, ...vueConfigs, ...browserConfigs]
