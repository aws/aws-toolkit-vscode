/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export async function activate(context: vscode.ExtensionContext) {
    void vscode.window.showInformationMessage(
        'Amazon Q + CodeWhisperer: This extension is under development and offers no features at this time.'
    )
}

export async function deactivate() {}

export const awsQActivate = activate
export const awsQDeactivate = deactivate
