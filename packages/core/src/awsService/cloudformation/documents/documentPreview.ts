/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NotificationType } from 'vscode-languageserver-protocol'
import { LanguageClient } from 'vscode-languageclient/node'
import { ViewColumn, window, workspace } from 'vscode'

type DocumentPreviewType = {
    content: string
    language: string
    viewColumn?: number
    preserveFocus?: boolean
}

const DocumentPreviewNotification = new NotificationType<DocumentPreviewType>('aws/document/preview')

export class DocumentPreview {
    constructor(private readonly client: LanguageClient) {
        this.client.onNotification(DocumentPreviewNotification, (preview: DocumentPreviewType) => {
            if (preview) {
                void docPreview(preview)
            }
        })
    }
}

export async function docPreview(preview: DocumentPreviewType) {
    const { content, language, viewColumn = ViewColumn.Beside, preserveFocus = true } = preview

    await window.showTextDocument(
        await workspace.openTextDocument({
            content,
            language,
        }),
        {
            viewColumn,
            preserveFocus,
        }
    )
}
