/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../shared/extensionGlobals'

/** Set if we are in web mode. Impacts {@link isWeb}. */
export function setWeb(value: boolean) {
    globals.isWeb = value
    vscode.commands.executeCommand('setContext', 'aws.isWebExtHost', true).then(undefined, e => {
        console.error('setContext failed: %s', (e as Error).message)
    })
}
/**
 * Return true if we are running in the browser (web mode), false otherwise.
 * If false, the environment we are running in is something like desktop (node.js).
 */
export function isWeb() {
    return (globals.isWeb ??= false)
}
