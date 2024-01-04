/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

let inBrowser = false
/** Set the value of if we are in the browser. Impacts {@link isInBrowser}. */
export function setInBrowser(value: boolean) {
    inBrowser = value
    vscode.commands.executeCommand('setContext', 'aws.isWebExtHost', true).then(undefined, e => {
        console.error('setContext failed: %s', (e as Error).message)
    })
}
/** Return true if we are running in the browser, false otherwise. */
export function isInBrowser() {
    return inBrowser
}
