/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { AmazonQChatViewProvider } from './webviewProvider'
import { registerCommands } from './commands'
import { registerLanguageServerEventListener, registerMessageListeners } from './messages'
import { getLogger, globals } from 'aws-core-vscode/shared'
import { activate as registerLegacyChatListeners } from '../../app/chat/activation'
import { DefaultAmazonQAppInitContext } from 'aws-core-vscode/amazonq'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { updateConfigurationRequestType } from '@aws/language-server-runtimes/protocol'

export async function activate(languageClient: LanguageClient, encryptionKey: Buffer, mynahUIPath: string) {
    // Make sure we've sent an auth profile to the language server before even initializing the UI
    await updateProfile(languageClient)

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
        if (provider.webview) {
            DefaultAmazonQAppInitContext.instance.getAppsToWebViewMessageListener().onMessage((msg) => {
                provider.webview?.postMessage(msg).then(undefined, (e) => {
                    getLogger().error('webView.postMessage failed: %s', (e as Error).message)
                })
            })
        }

        registerMessageListeners(languageClient, provider, encryptionKey)
    })

    // register event listeners from the legacy agent flow
    await registerLegacyChatListeners(globals.context)

    globals.context.subscriptions.push(
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(async () => {
            void updateProfile(languageClient)
            await provider.refreshWebview()
        })
    )
}

async function updateProfile(client: LanguageClient) {
    // update the profile on the language server
    await client.sendRequest(updateConfigurationRequestType.method, {
        section: 'aws.q',
        settings: {
            profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
        },
    })
}
