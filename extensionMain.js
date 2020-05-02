/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const join = require('path').join

/**
 * This file serves as the extension's entrypoint.
 * It loads the actual entrypoints from a webpack bundle or from
 * tsc compiled source based on the AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE environment variable.
 *
 * This allows us to activate the extension from tests.
 */

Object.defineProperty(exports, '__esModule', { value: true })

const extensionEntryPath = useBundledEntrypoint()
    ? join(__dirname, 'dist', 'extension')
    : join(__dirname, 'dist', 'src', 'extension')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extension = require(extensionEntryPath)

async function activate(context) {
    return await extension.awsToolkitActivate(context)
}

async function deactivate() {
    await extension.awsToolkitDeactivate()
}

function useBundledEntrypoint() {
    return (process.env.AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE || 'false').toLowerCase() !== 'true'
}

exports.activate = activate
exports.deactivate = deactivate
