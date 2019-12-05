/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

;('use strict')

/**
 * This file serves as the extension's entrypoint.
 * It loads the actual entrypoints from a webpack bundle or from
 * tsc compiled source based on the AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE environment variable.
 *
 * This allows us to activate the extension from tests.
 */

Object.defineProperty(exports, '__esModule', { value: true })

const extensionEntryPath = useBundledEntrypoint() ? './dist/extension' : './dist/src/extension'
const extension = require(extensionEntryPath)

async function activate(context) {
    return await extension.awsToolkitActivate(context)
}

async function deactivate() {
    await extension.awsToolkitDeactivate()
}

function useBundledEntrypoint() {
    const ignoreWebpackBundle = /true/i.test(process.env.AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE || 'false')
    return !ignoreWebpackBundle
}

exports.activate = activate
exports.deactivate = deactivate
