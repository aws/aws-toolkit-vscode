/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { AmazonQChatViewProvider } from './webviewProvider'
import { registerCommands } from './commands'
import { registerLanguageServerEventListener, registerMessageListeners } from './messages'
import { globals } from 'aws-core-vscode/shared'

export function activate(languageClient: LanguageClient, encryptionKey: Buffer, mynahUIPath: string) {
    const provider = new AmazonQChatViewProvider(mynahUIPath)

    globals.context.subscriptions.push(
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )

    /**
     * Commands are registered independent of the webview being open because when they're executed
     * they focus the webview
     **/
    registerCommands(provider)
    registerLanguageServerEventListener(languageClient, provider)

    provider.onDidResolveWebview(() => {
        registerMessageListeners(languageClient, provider, encryptionKey)
    })
}
