/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
//import { Bucket, DownloadFileRequest, File, S3Client } from '../../shared/clients/s3Client'
import { getLogger } from '../../shared/logger'

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
        if (this.editor && this.editor.document.uri.scheme === 'file') {
            try {
                const doc = await workspace.openTextDocument(this.fileUri) // calls back into the provider
                this.editor = await this.window.showTextDocument(doc, { preview: false })
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            } catch (e) {
                getLogger().error(`Given file not found, error: ${e}`)
            }
        }

        if (!this.s3Uri) {
            this.s3Uri = vscode.Uri.parse('s3:' + this.fileUri.fsPath)
        }

        try {
            const doc = await workspace.openTextDocument(this.s3Uri) // calls back into the provider
            this.editor = await this.window.showTextDocument(doc, { preview: false })
            return this.editor
        } catch (e) {
            getLogger().error(`Given file not found, error: ${e}`)
        }
    }

    public async openFileOnEditMode(workspace = vscode.workspace): Promise<vscode.TextEditor | undefined> {
        //if editor is defined, it means there exists already an editor for this tab open
        if (this.editor && this.editor.document.uri.scheme === 's3') {
            try {
                const doc = await workspace.openTextDocument(this.s3Uri) // calls back into the provider
                this.editor = await this.window.showTextDocument(doc, { preview: false })
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            } catch (e) {
                getLogger().error(`Given file not found, error: ${e}`)
            }
        }
        //close it, then set it undefined

        try {
            const doc = await workspace.openTextDocument(this.fileUri) // calls back into the provider
            this.editor = await this.window.showTextDocument(doc, { preview: false })
            return this.editor
        } catch (e) {
            getLogger().error(`Given file not found, error: ${e}`)
        }
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
