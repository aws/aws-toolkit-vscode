/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
// import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { isCloud9 } from '../../../shared/extensionUtilities'
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
        this.session = new Session([], workspaceRoot)
    }

    // Instrument the client sending here
    public async send(msg: string): Promise<string | undefined> {
        console.log(msg)

        const result = await this.session.send(msg)

        return result
    }
}

const Panel = VueWebview.compilePanel(WeaverbirdChatWebview)
let activePanel: InstanceType<typeof Panel> | undefined

const View = VueWebview.compileView(WeaverbirdChatWebview)
let activeView: InstanceType<typeof View> | undefined

export async function showChat(ctx: vscode.ExtensionContext): Promise<void> {
    activePanel ??= new Panel(ctx)
    await activePanel.show({
        title: 'Weaverbird Chat', // TODO localize
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })
}

export async function registerChatView(ctx: vscode.ExtensionContext): Promise<WeaverbirdChatWebview> {
    activeView ??= new View(ctx)
    activeView.register({
        title: 'Weaverbird Chat',
    })
    return activeView.server
}
