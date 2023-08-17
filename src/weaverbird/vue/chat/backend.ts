/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
// import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { Session } from './session'

// const localize = nls.loadMessageBundle()

export class WeaverbirdChatWebview extends VueWebview {
    public readonly id = 'configureChat'
    public readonly source = 'src/weaverbird/vue/chat/index.js'
    public readonly onDidCreateContent = new vscode.EventEmitter<string>()
    public readonly onDidSubmitPlan = new vscode.EventEmitter<void>()
    public readonly session: Session

    public constructor() {
        // private readonly _client: codeWhispererClient // would be used if we integrate with codewhisperer
        super()

        // TODO do something better then handle this in the constructor
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            throw new Error('Could not find workspace folder')
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath
        this.session = new Session(workspaceRoot)
    }

    public async getSession(): Promise<Session> {
        // TODO if we have a client we can do a async request here to get the history (if any)
        return this.session
    }

    // Instrument the client sending here
    public async send(msg: string): Promise<string | undefined> {
        console.log(msg)
        const result = await this.session.send(msg)
        return result
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
