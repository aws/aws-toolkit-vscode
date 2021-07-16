/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
//import { Bucket, DownloadFileRequest, File, S3Client } from '../../shared/clients/s3Client'

//const fs = require('fs')

export class S3Tab {
    //private file: File
    private s3Uri: vscode.Uri
    private window: typeof vscode.window
    private editor: vscode.TextEditor | undefined
    //private context: Context
    //private outputChannel: vscode.OutputChannel
    //private activeTab: vscode.TextDocument | undefined
    //private editing: boolean
    //private context: Context
    //private outputChannel: vscode.OutputChannel
    //private activeTab: vscode.TextDocument | undefined

    //private editing: boolean

    public constructor(private fileUri: vscode.Uri, window = vscode.window) {
        this.s3Uri = vscode.Uri.parse('s3:' + this.fileUri.fsPath)
        this.window = window

        //if file is text, start state will be read-only

        //if file is not text, open file on edit-mode with disabled edit button

        //this.outputChannel = ext.outputChannel
    }

    public async openFileOnReadOnly(workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
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
            //there is a tab open in edit-mode, it needs to be focused, then closed
            await this.window.showTextDocument(openEditor.document, {
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

    public async openFileOnEditMode(workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
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

    public async getActiveEditor(): Promise<vscode.TextEditor | undefined> {
        const visibleEditor = vscode.window.visibleTextEditors

        return visibleEditor.find((editor: vscode.TextEditor) => editor.document.uri.fsPath === this.fileUri.fsPath)
    }
    //onPressedButton = change state, how to do this?
}

/*
interface State {
    openFile(context: Context, window: typeof vscode.window): void
}


class ReadOnlyState implements State {
    private fileUri: vscode.Uri
    private provider: S3DocumentProvider
    private s3Uri: vscode.Uri

    public constructor(fileUri: vscode.Uri) {
        this.fileUri = fileUri
        this.s3Uri = vscode.Uri.parse('s3:' + this.fileUri.fsPath)
        this.provider = new S3DocumentProvider()
    }

    async openFile(context: Context, window: typeof vscode.window) {
        context.state = this
        //this.fileUri.scheme = 's3'
        //window.showTextDocument(this.fileUri)
        //testutil.toFile('bogus', tempFile.fsPath)
        const doc = await vscode.workspace.openTextDocument(this.s3Uri) // calls back into the provider
        //vscode.languages.setTextDocumentLanguage(doc, 'txt')
        await vscode.window.showTextDocument(doc, { preview: false })
    }
}

//TODOD:: implement all for this
class EditModeState implements State {
    private fileUri: vscode.Uri

    public constructor(fileUri: vscode.Uri, context: Context) {
        this.fileUri = fileUri
    }

    openFile() {}
}

class Context {
    private fileUri: vscode.Uri
    state?: State | undefined

    public constructor(fileUri: vscode.Uri) {
        //this.state = new ReadOnlyState(fileUri)
        this.fileUri = fileUri
    }
    
    public set state (newState: State){
        this.state = newState
    }

    public get state () {
        return this.state
    }
}*/
