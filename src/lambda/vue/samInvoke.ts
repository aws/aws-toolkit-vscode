/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createVueWebview } from '../../webviews/main'

export function registerSamInvokeVueCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('aws.lambda.vueTest', async () => {
        await createVueWebview({
            id: 'create',
            name: 'VueTest',
            webviewJs: 'samInvokeVue.js',
            onDidReceiveMessageFunction: handleMessage,
            context,
        })
    })
}

export interface BackendToFrontend {
    newText: string
}

export interface FrontendToBackend {
    messageText: string
}

export async function handleMessage(
    message: FrontendToBackend,
    postMessageFn: (response: BackendToFrontend) => Thenable<boolean>,
    destroyWebviewFn: () => any
): Promise<any> {
    // message handler here!
    // https://github.com/aws/aws-toolkit-vscode/blob/experiments/react-hooks/src/webviews/activation.ts#L39 for inspiration
    const val = await vscode.window.showInformationMessage(message.messageText, 'Reply', 'Close Webview')

    if (val === 'Reply') {
        const reply = await vscode.window.showInputBox({ prompt: 'Write somethin will ya?' })
        if (reply) {
            const success = await postMessageFn({ newText: reply })
            if (!success) {
                vscode.window.showInformationMessage('webview message fail')
            }
        } else {
            vscode.window.showInformationMessage('You should type something...')
        }
    } else if (val === 'Close Webview') {
        destroyWebviewFn()
    }
}
