/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { AmazonQChatViewProvider } from './webviewProvider'
import { registerCommands } from './commands'
import { registerLanguageServerEventListener, registerMessageListeners } from './messages'
import { Commands, getLogger, globals, undefinedIfEmpty } from 'aws-core-vscode/shared'
import { activate as registerLegacyChatListeners } from '../../app/chat/activation'
import { DefaultAmazonQAppInitContext } from 'aws-core-vscode/amazonq'
import { AuthUtil, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
import { updateConfigurationRequestType } from '@aws/language-server-runtimes/protocol'

export async function activate(languageClient: LanguageClient, encryptionKey: Buffer, mynahUIPath: string) {
    const disposables = globals.context.subscriptions

    // Make sure we've sent an auth profile to the language server before even initializing the UI
    await updateConfiguration(languageClient, {
        profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
    })

    const provider = new AmazonQChatViewProvider(mynahUIPath)

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
            void updateConfiguration(languageClient, {
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            await provider.refreshWebview()
        }),
        Commands.register('aws.amazonq.updateCustomizations', () => {
            void updateConfiguration(languageClient, {
                customization: undefinedIfEmpty(getSelectedCustomization().arn),
            })
        })
    )
}

async function updateConfiguration(
    client: LanguageClient,
    settings: {
        [key: string]: string | undefined
    }
) {
    // update the profile on the language server
    await client.sendRequest(updateConfigurationRequestType.method, {
        section: 'aws.q',
        settings,
    })
}
