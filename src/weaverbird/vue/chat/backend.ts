/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
// import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { Session } from './session'
import * as path from 'path'
import * as fs from 'fs'
import { LLMConfig } from '../../types'
import { LocalResolvedConfig, getConfig } from '../../config'
import { Interaction } from './sessionState'
import { VirualFileSystem } from '../../../shared/virtualFilesystem'
import { weaverbirdScheme } from '../../constants'

// const localize = nls.loadMessageBundle()

export class WeaverbirdChatWebview extends VueWebview {
    public readonly id = 'configureChat'
    public readonly source = 'src/weaverbird/vue/chat/index.js'
    public readonly session: Session
    public readonly workspaceRoot: string
    public readonly onAddToHistory: vscode.EventEmitter<Interaction[]>
    private readonly fs: VirualFileSystem

    public constructor(backendConfig: LocalResolvedConfig, fs: VirualFileSystem) {
        // private readonly _client: codeWhispererClient // would be used if we integrate with codewhisperer
        super()

        // TODO do something better then handle this in the constructor
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            throw new Error('Could not find workspace folder')
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath
        this.workspaceRoot = workspaceRoot
        this.onAddToHistory = new vscode.EventEmitter<Interaction[]>()
        this.session = new Session(workspaceRoot, this.onAddToHistory, backendConfig, fs)
        this.fs = fs
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

    public displayDiff(filePath: string) {
        const emptyFile = vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty' })
        const fileName = path.basename(filePath)
        const originalFileUri = vscode.Uri.file(path.join(this.workspaceRoot, filePath))
        const originalFileExists = fs.existsSync(originalFileUri.fsPath)
        const leftFileUri = originalFileExists ? originalFileUri : emptyFile
        const newFileUri = vscode.Uri.from({ scheme: weaverbirdScheme, path: filePath })
        const title = originalFileExists ? `${fileName} ↔ ${fileName}` : `${fileName} (created)`

        vscode.commands.executeCommand('vscode.diff', leftFileUri, newFileUri, title)
    }

    public async acceptChanges(filePaths: string[]) {
        for (const filePath of filePaths) {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath)

            const uri = vscode.Uri.from({ scheme: weaverbirdScheme, path: filePath })
            const content = await this.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)

            fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
            fs.writeFileSync(absolutePath, decodedContent)
        }
    }

    public setLLMConfig(config: LLMConfig) {
        this.session.setLLMConfig(config)
    }
}

const View = VueWebview.compileView(WeaverbirdChatWebview)
let activeView: InstanceType<typeof View> | undefined

export async function registerChatView(
    ctx: vscode.ExtensionContext,
    fs: VirualFileSystem
): Promise<WeaverbirdChatWebview> {
    const backendConfig = await getConfig()
    activeView ??= new View(ctx, backendConfig, fs)
    activeView.register({
        title: 'Weaverbird Chat',
    })
    return activeView.server
}
