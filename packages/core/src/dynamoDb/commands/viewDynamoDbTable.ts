/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'

export async function prepareDocument(uri: vscode.Uri) {
    try {
        // Gets the data: calls filterLogEventsFromUri().
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { preview: false })
        await vscode.languages.setTextDocumentLanguage(doc, 'log')
    } catch (err) {
        if (CancellationError.isUserCancelled(err)) {
            throw err
        }
    }
}

export async function scanTable(node: DynamoDbTableNode) {
    console.log('Yes, Table selected')
}
