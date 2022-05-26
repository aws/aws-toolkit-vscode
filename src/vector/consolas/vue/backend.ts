/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'

export class ConsolasWebview extends VueWebview {
    public readonly id = 'aws.consolas.enabledCodeSuggestions'
    public readonly source = 'src/vector/consolas/vue/index.js'

    public readonly onDidChangeTriggerStatus = new vscode.EventEmitter<boolean>()
    public readonly onDidChangeKeyBinding = new vscode.EventEmitter<string>()

    public async controlTrigger() {
        await vscode.commands.executeCommand('aws.consolas.acceptTermsOfService')
        this.dispose()
    }

    public async cancelCodeSuggestion() {
        await vscode.commands.executeCommand('aws.consolas.cancelTermsOfService')
        this.dispose()
    }
}

const Panel = VueWebview.compilePanel(ConsolasWebview)
let activeWebview: vscode.WebviewPanel | undefined

export async function showView(context: vscode.ExtensionContext) {
    if (!activeWebview) {
        activeWebview = await new Panel(context).show({ title: 'Terms And Conditions' })
        activeWebview.onDidDispose(() => (activeWebview = undefined))
    } else {
        activeWebview.reveal()
    }
}
