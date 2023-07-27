/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { isCloud9 } from '../../../shared/extensionUtilities'

const localize = nls.loadMessageBundle()

export class WeaverbirdChatWebview extends VueWebview {
    public readonly id = 'configureChat'
    public readonly source = 'src/weaverbird/vue/chat/index.js'

    public constructor() // private readonly _client: codeWhispererClient // would be used if we integrate with codewhisperer
    {
        super()
    }

    public init() {
        // history could come from a previous chat session if neccessary
        return {
            history: [],
        }
    }

    public async send(msg: string): Promise<string | undefined> {
        // Instrument the client sending here
        console.log(msg)
        return undefined
    }
}

const Panel = VueWebview.compilePanel(WeaverbirdChatWebview)
let activePanel: InstanceType<typeof Panel> | undefined

export async function showChat(ctx: vscode.ExtensionContext): Promise<void> {
    activePanel ??= new Panel(ctx)
    await activePanel.show({
        title: 'Weaverbird Chat', // TODO localize
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })
}
