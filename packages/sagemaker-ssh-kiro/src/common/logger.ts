/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

let logger: vscode.LogOutputChannel | undefined

export function initializeLogger(): vscode.LogOutputChannel {
    logger = vscode.window.createOutputChannel('Amazon SageMaker SSH Plugin for Kiro', { log: true })
    return logger
}

export function getLogger(): vscode.LogOutputChannel {
    if (!logger) {
        throw new Error('Logger not initialized. This was probably called before extension activation')
    }
    return logger
}
