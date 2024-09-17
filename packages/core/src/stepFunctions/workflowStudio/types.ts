/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export type WebviewContext = {
    panel: vscode.WebviewPanel
    textDocument: vscode.TextDocument
    disposables: vscode.Disposable[]
    workSpacePath: string
    defaultTemplatePath: string
    defaultTemplateName: string
    loaderNotification: undefined | LoaderNotification
    fileId: string
}

export type LoaderNotification = {
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>
    cancellationToken: vscode.CancellationToken
    resolve: () => void
}
