/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as vscode from 'vscode'

let localize: nls.LocalizeFunc

export async function activate(context: vscode.ExtensionContext) {
    localize = nls.loadMessageBundle()

    void vscode.window.showInformationMessage(
        'Amazon Q + CodeWhisperer: This extension is under development and offers no features at this time.'
    )
}

export async function deactivate() {}

export const awsQActivate = activate
export const awsQDeactivate = deactivate
