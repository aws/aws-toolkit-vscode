/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { AmazonQChatViewProvider } from './webviewProvider'
import { focusAmazonQPanel, registerCommands } from './commands'
import { registerLanguageServerEventListener, registerMessageListeners } from './messages'
import { Commands, getLogger, globals, undefinedIfEmpty } from 'aws-core-vscode/shared'
import { activate as registerLegacyChatListeners } from '../../app/chat/activation'
import { DefaultAmazonQAppInitContext } from 'aws-core-vscode/amazonq'
import { AuthUtil, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
import { pushConfigUpdate } from '../config'

export async function activate(languageClient: LanguageClient, encryptionKey: Buffer, mynahUIPath: string) {
    const disposables = globals.context.subscriptions

    const provider = new AmazonQChatViewProvider(mynahUIPath, languageClient)

    disposables.push(
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
        const disposable = DefaultAmazonQAppInitContext.instance.getAppsToWebViewMessageListener().onMessage((msg) => {
            /**
             * codewhispers app handler is still registered because the activation flow hasn't been refactored.
             * We need to explicitly deny events like restoreTabMessage, otherwise they will be forwarded to the frontend
             *
             */
            if (msg.sender === 'CWChat' && ['restoreTabMessage', 'contextCommandData'].includes(msg.type)) {
                return
            }
            provider.webview?.postMessage(msg).then(undefined, (e) => {
                getLogger().error('webView.postMessage failed: %s', (e as Error).message)
            })
        })

        if (provider.webviewView) {
            disposables.push(
                provider.webviewView.onDidDispose(() => {
                    disposable.dispose()
                })
            )
        }

        registerMessageListeners(languageClient, provider, encryptionKey)
    })

    // register event listeners from the legacy agent flow
    await registerLegacyChatListeners(globals.context)

    disposables.push(
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(async () => {
            await provider.refreshWebview()
        }),
        Commands.register('aws.amazonq.updateCustomizations', () => {
            void pushConfigUpdate(languageClient, {
                type: 'customization',
                customization: undefinedIfEmpty(getSelectedCustomization().arn),
            })
        }),
        Commands.register('aws.amazonq.manageSubscription', () => {
            focusAmazonQPanel().catch((e) => languageClient.error(`[VSCode Client] focusAmazonQPanel() failed`))

            languageClient
                .sendRequest('workspace/executeCommand', {
                    command: 'aws/chat/manageSubscription',
                    // arguments: [],
                })
                .catch((e) => {
                    getLogger('amazonqLsp').error('failed request: aws/chat/manageSubscription: %O', e)
                })
        }),
        globals.logOutputChannel.onDidChangeLogLevel((logLevel) => {
            getLogger('amazonqLsp').info(`Local log level changed to ${logLevel}, notifying LSP`)
            void pushConfigUpdate(languageClient, {
                type: 'logLevel',
            })
        })
    )
}
