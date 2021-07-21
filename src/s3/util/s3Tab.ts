/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
//import { Bucket, DownloadFileRequest, File, S3Client } from '../../shared/clients/s3Client'

//need to subscribe to ondidsave and upload to s3, might need the S3FileNode

export class S3Tab {
    //private file: File
    private s3Uri: vscode.Uri
    private window: typeof vscode.window
    private editor: vscode.TextEditor | undefined

    //private editing: boolean

    public constructor(private fileUri: vscode.Uri, window = vscode.window) {
        this.s3Uri = vscode.Uri.parse('s3:' + this.fileUri.fsPath)
        this.window = window
    }

    public async openFileInReadOnly(workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
        //find if there is any active editor for this uri
        const openEditor = await this.getActiveEditor()

        if (!openEditor) {
            //there isn't any tab open for this uri, simply open it in read-only with the s3Uri
            const doc = await workspace.openTextDocument(this.s3Uri)
            this.editor = await this.window.showTextDocument(doc, { preview: false })

            return this.editor
        } else if (openEditor.document.uri.scheme === 's3') {
            //there is one already in read-only, just shift focus to it by reopening it with the ViewColumn option
            await this.window.showTextDocument(openEditor.document, {
                preview: false,
                viewColumn: openEditor.viewColumn,
            })
            this.editor = openEditor

            return this.editor
        } else if (openEditor.document.uri.scheme === 'file') {
            //there is a tab open in edit-mode, just needs to be focused
            this.editor = await this.window.showTextDocument(openEditor.document, {
                preview: false,
                viewColumn: openEditor.viewColumn,
            })
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            //good to open in read-only
            const doc = await workspace.openTextDocument(this.s3Uri)
            this.editor = await this.window.showTextDocument(doc, { preview: false })

            return this.editor
        }

        return undefined
    }

    public async openFileInEditMode(workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
        //find if there is any active editor for this uri
        const openEditor = await this.getActiveEditor()

        if (!openEditor) {
            //there wasn't any open, just display it regularly
            const doc = await workspace.openTextDocument(this.fileUri)
            this.editor = await this.window.showTextDocument(doc, { preview: false })

            return this.editor
        } else if (openEditor.document.uri.scheme === 'file') {
            //there is a tab for this uri open in edit-mode, just shift focus to it by reopening it with the ViewColumn option
            await this.window.showTextDocument(openEditor.document, {
                preview: false,
                viewColumn: openEditor.viewColumn,
            })
            this.editor = openEditor

            return this.editor
        } else if (openEditor.document.uri.scheme === 's3') {
            // there is a read-only tab open, it needs to be focused, then closed
            await this.window.showTextDocument(openEditor.document, {
                preview: false,
                viewColumn: openEditor.viewColumn,
            })
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            //good to open in edit-mode
            const doc = await workspace.openTextDocument(this.fileUri)
            this.editor = await this.window.showTextDocument(doc, { preview: false })

            return this.editor
        }

        return undefined
    }

    //will be deleted when handling usage of this.editor, need to check when tab closes to set it undefined
    public async getActiveEditor(): Promise<vscode.TextEditor | undefined> {
        const visibleEditor = vscode.window.visibleTextEditors

        return visibleEditor.find((editor: vscode.TextEditor) => editor.document.uri.fsPath === this.fileUri.fsPath)
    }
    //onPressedButton = change state, how to do this?
}
