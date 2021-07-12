/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
//import { Bucket, DownloadFileRequest, File, S3Client } from '../../shared/clients/s3Client'
import { showOutputMessage } from '../../shared/utilities/messages'
import { getLogger } from '../../shared/logger'
import * as testutil from '../../test/testUtil'
import { readFileAsString } from '../../shared/filesystemUtilities'

const fs = require('fs')

export class S3Tab {
    //private file: File
    private fileUri: vscode.Uri
    private window: typeof vscode.window
    private context: Context
    private outputChannel: vscode.OutputChannel

    //private editing: boolean

    public constructor(uri: vscode.Uri, window = vscode.window) {
        this.fileUri = uri
        this.window = window
        //if file is text, start state will be read-only
        //if file is not text, open file regularly and disable edit button
        this.context = new Context(this.fileUri)
        this.outputChannel = ext.outputChannel
        //this.display()
    }

    async display() {
        //const startState = new ReadOnlyState(this.fileUri)
        // await startState.openFile(this.context, this.window)
        //This only displays textDocuments
        //const doc = await vscode.workspace.openTextDocument(this.fileUri)
        //this.window.showTextDocument(this.fileUri)
    }

    async openFileOnReadOnly(window: typeof vscode.window) {
        const s3Uri = vscode.Uri.parse('s3:' + this.fileUri.fsPath)
        //this.fileUri.scheme = 's3'
        //window.showTextDocument(this.fileUri)
        //testutil.toFile('bogus', tempFile.fsPath)
        const doc = await vscode.workspace.openTextDocument(s3Uri) // calls back into the provider
        //vscode.languages.setTextDocumentLanguage(doc, 'txt')
        await window.showTextDocument(doc, { preview: false })
    }

    //onPressedButton = change state, how to do this?
}
export class S3DocumentProvider implements vscode.TextDocumentContentProvider {
    public constructor() {}

    onDidChange?: vscode.Event<vscode.Uri> | undefined

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        //const fileStr = {data: ''}
        let data: any
        try {
            //data = await fs.readFileSync(uri.fsPath)
            data = await readFileAsString(uri.fsPath)
        } catch (e) {
            showOutputMessage(`${e}`, ext.outputChannel)
        }
        //getLogger().debug(data!)
        showOutputMessage(data!, ext.outputChannel)
        /*
        fs.readFile(uri.fsPath, function(err:any, data:any) {
            if(err) throw err;

            const arr = data.toString().replace(/\r\n/g,'\n').split('\n');
            //fileStr.data = arr.join('\n')

            for(const i of arr) {
                showOutputMessage(`${i}`, ext.outputChannel)
            }
        })*/

        return data
    }
}
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
    /*
    public set state (newState: State){
        this.state = newState
    }

    public get state () {
        return this.state
    }*/
}
