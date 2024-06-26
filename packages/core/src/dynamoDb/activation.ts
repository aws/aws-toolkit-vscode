/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.dynamoDb.openRemoteConnection', async () => {
            await openRemoteConnection()
        })
    )
}

export async function openRemoteConnection() {
    // do nothing
}
