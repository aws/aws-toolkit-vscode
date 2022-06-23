/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isCloud9 } from '../../shared/extensionUtilities'
import { VueWebview } from '../../webviews/main'

export class CodeWhispererWebview extends VueWebview {
    public readonly id = 'aws.codeWhisperer.enabledCodeSuggestions'
    public readonly source = 'src/codewhisperer/vue/index.js'

    public readonly onDidChangeTriggerStatus = new vscode.EventEmitter<boolean>()
    public readonly onDidChangeKeyBinding = new vscode.EventEmitter<string>()

    public async controlTrigger() {
        await vscode.commands.executeCommand('aws.codeWhisperer.acceptTermsOfService')
        this.dispose()
    }

    public async cancelCodeSuggestion() {
        await vscode.commands.executeCommand('aws.codeWhisperer.cancelTermsOfService')
        this.dispose()
    }

    public isCloud9() {
        return isCloud9()
    }
}

const Panel = VueWebview.compilePanel(CodeWhispererWebview)
let activeWebview: vscode.WebviewPanel | undefined

export async function showView(context: vscode.ExtensionContext) {
    if (!activeWebview) {
        activeWebview = await new Panel(context).show({ title: 'Amazon CodeWhisperer Terms of Service' })
        activeWebview.onDidDispose(() => (activeWebview = undefined))
    } else {
        activeWebview.reveal()
    }
}
