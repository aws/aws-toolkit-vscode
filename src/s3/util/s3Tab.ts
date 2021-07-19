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

    public async openFileOnReadOnly(workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
        //find if there is any active editor for this uri
        return this.openFile(this.s3Uri, workspace)
    }

    public async openFileOnEditMode(workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
        //find if there is any active editor for this uri
        return this.openFile(this.fileUri, workspace)
    }

    public async openFile(uri: vscode.Uri, workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
        //find if there is any active editor for this uri
        const openEditor = await this.getActiveEditor()
        try {
            const doc = await workspace.openTextDocument(uri)
            if (!openEditor) {
                //there wasn't any open, just display it regularly
                this.editor = await this.window.showTextDocument(doc, { preview: false })
            } else if (openEditor.document.uri.scheme === uri.scheme) {
                //there is a tab for this uri scheme open, just shift focus to it by reopening it with the ViewColumn option
                await this.window.showTextDocument(openEditor.document, {
                    preview: false,
                    viewColumn: openEditor.viewColumn,
                })
                this.editor = openEditor
            } else if (openEditor.document.uri.scheme !== uri.scheme) {
                // there is a read-only tab open, it needs to be focused, then closed
                await this.window.showTextDocument(openEditor.document, {
                    preview: false,
                    viewColumn: openEditor.viewColumn,
                })
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
                //good to open in given mode
                this.editor = await this.window.showTextDocument(doc, { preview: false })
            }
        } catch (e) {
            this.window.showErrorMessage('Error opening file ', e)
            this.editor = undefined
        }

        return this.editor
    }

    //will be deleted when handling usage of this.editor, need to check when tab closes to set it undefined
    public async getActiveEditor(): Promise<vscode.TextEditor | undefined> {
        const visibleEditor = vscode.window.visibleTextEditors

        return visibleEditor.find((editor: vscode.TextEditor) => editor.document.uri.fsPath === this.fileUri.fsPath)
    }
    //onPressedButton = change state, how to do this?
}
