/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
// import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { Interaction, Session } from './session'
import { MemoryFile } from '../../memoryFile'
import * as path from 'path'
import * as fs from 'fs'
import { LLMConfig } from './types'

// const localize = nls.loadMessageBundle()

export class WeaverbirdChatWebview extends VueWebview {
    public readonly id = 'configureChat'
    public readonly source = 'src/weaverbird/vue/chat/index.js'
    public readonly session: Session
    public readonly workspaceRoot: string

    public constructor() {
        // private readonly _client: codeWhispererClient // would be used if we integrate with codewhisperer
        super()

        // TODO do something better then handle this in the constructor
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            throw new Error('Could not find workspace folder')
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath
        this.workspaceRoot = workspaceRoot
        this.session = new Session(workspaceRoot)
    }

    public async getSession(): Promise<Session> {
        // TODO if we have a client we can do a async request here to get the history (if any)
        return this.session
    }

    // Instrument the client sending here
    public async send(msg: string): Promise<Interaction | Interaction[] | undefined> {
        console.log(msg)
        const result = await this.session.send(msg)
        return result
    }

    public displayDiff(file: MemoryFile) {
        const emptyFile = new MemoryFile('empty')
        const fileName = path.basename(file.uri.path)
        const originalFileUri = vscode.Uri.file(path.join(this.workspaceRoot, file.uri.path))
        const originalFileExists = fs.existsSync(originalFileUri.fsPath)
        const leftFileUri = originalFileExists ? originalFileUri : emptyFile.uri
        const newFileUri = vscode.Uri.from(file.uri)
        const title = originalFileExists ? `${fileName} ↔ ${fileName}` : `${fileName} (created)`

        vscode.commands.executeCommand('vscode.diff', leftFileUri, newFileUri, title)
    }

    public acceptChanges(files: MemoryFile[]) {
        for (const file of files) {
            const filePath = file.uri.path
            const pathUsed = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath)
            fs.mkdirSync(path.dirname(pathUsed), { recursive: true })
            fs.writeFileSync(pathUsed, file.content)
        }
    }
    public setLLMConfig(config: LLMConfig) {
        this.session.setLLMConfig(config)
    }
}

const View = VueWebview.compileView(WeaverbirdChatWebview)
let activeView: InstanceType<typeof View> | undefined

export async function registerChatView(ctx: vscode.ExtensionContext): Promise<WeaverbirdChatWebview> {
    activeView ??= new View(ctx)
    activeView.register({
        title: 'Weaverbird Chat',
    })
    return activeView.server
}
