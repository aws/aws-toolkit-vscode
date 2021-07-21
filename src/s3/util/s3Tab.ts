/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
//import { Bucket, DownloadFileRequest, File, S3Client } from '../../shared/clients/s3Client'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { S3Client } from '../../shared/clients/s3Client'
import { uploadWithProgress } from '../commands/uploadFile'
//need to subscribe to ondidsave and upload to s3, might need the S3FileNode

//const contentType = mime.lookup(path.basename(request.fileLocation.fsPath)) || DEFAULT_CONTENT_TYPE
//FOUND IN : s3Client.ts
export class S3Tab {
    public s3Uri: vscode.Uri
    private window: typeof vscode.window
    private editor: vscode.TextEditor | undefined
    private parent: S3BucketNode | S3FolderNode
    private s3Client: S3Client

    public constructor(public fileUri: vscode.Uri, public s3FileNode: S3FileNode, window = vscode.window) {
        this.s3Uri = vscode.Uri.parse('s3:' + this.fileUri.fsPath)
        this.parent = s3FileNode.parent
        this.window = window
        this.s3Client = s3FileNode.s3
    }

    public async openFileInReadOnly(workspace = vscode.workspace): Promise<void> {
        await this.openFile(this.s3Uri, workspace)
    }

    public async openFileInEditMode(workspace = vscode.workspace): Promise<void> {
        await this.openFile(this.fileUri, workspace)
    }

    public async openFile(uri: vscode.Uri, workspace = vscode.workspace): Promise<void> {
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
                await this.focusAndCloseTab()
                //good to open in given mode
                this.editor = await this.window.showTextDocument(doc, { preview: false })
            }
        } catch (e) {
            this.window.showErrorMessage('Error opening file ', e)
            this.editor = undefined
        }
    }

    public async focusAndCloseTab(): Promise<void> {
        const editor = await this.getActiveEditor()
        if (!editor) {
            return
        }
        await this.window.showTextDocument(editor.document, {
            preview: false,
            viewColumn: editor.viewColumn,
        })
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    /**
     * Uploads current uri back to parent
     *
     * @returns true if upload succe]
     */
    public async uploadChangesToS3(): Promise<boolean> {
        const request = {
            bucketName: this.s3FileNode.bucket.name,
            key: this.parent.path + this.s3FileNode.name,
            fileLocation: this.fileUri,
            fileSizeBytes: this.s3FileNode.file.sizeBytes!,
            s3Client: this.s3Client,
            window: this.window,
        }
        try {
            await uploadWithProgress(request)
        } catch (e) {
            //error with upload
            return false
        }
        return true
    }

    //will be deleted when handling usage of this.editor, need to check when tab closes to set it undefined
    public async getActiveEditor(): Promise<vscode.TextEditor | undefined> {
        const visibleEditor = vscode.window.visibleTextEditors

        return visibleEditor.find((editor: vscode.TextEditor) => editor.document.uri.fsPath === this.fileUri.fsPath)
    }
}
