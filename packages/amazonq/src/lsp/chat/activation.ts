/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { AmazonQChatViewProvider } from './webviewProvider'
import { registerCommands } from './commands'
import { registerLanguageServerEventListener, registerMessageListeners } from './messages'
import { Commands, getLogger, globals, Settings, undefinedIfEmpty } from 'aws-core-vscode/shared'
import { activate as registerLegacyChatListeners } from '../../app/chat/activation'
import { DefaultAmazonQAppInitContext } from 'aws-core-vscode/amazonq'
import { AuthUtil, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
import {
    DidChangeConfigurationNotification,
    updateConfigurationRequestType,
} from '@aws/language-server-runtimes/protocol'
import { getLspLogSettings, lspSettingsSection } from '../config'

export async function activate(languageClient: LanguageClient, encryptionKey: Buffer, mynahUIPath: string) {
    const disposables = globals.context.subscriptions

    // Make sure we've sent an auth profile to the language server before even initializing the UI
    await pushConfigUpdate(languageClient, {
        type: 'profile',
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
            void pushConfigUpdate(languageClient, {
                type: 'profile',
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            await provider.refreshWebview()
        }),
        Commands.register('aws.amazonq.updateCustomizations', () => {
            void pushConfigUpdate(languageClient, {
                type: 'customization',
                customization: undefinedIfEmpty(getSelectedCustomization().arn),
            })
        }),
        Settings.instance.onDidChangeSection(lspSettingsSection, () => {
            void pushConfigUpdate(languageClient, { type: 'logging', ...getLspLogSettings() })
        })
    )
}

/**
 * Push a config value to the language server, effectively updating it with the
 * latest configuration from the client.
 *
 * The issue is we need to push certain configs to different places, since there are
 * different handlers for specific configs. So this determines the correct place to
 * push the given config.
 */
async function pushConfigUpdate(client: LanguageClient, config: QConfigs) {
    if (config.type === 'profile') {
        await client.sendRequest(updateConfigurationRequestType.method, {
            section: 'aws.q',
            settings: { profileArn: config.profileArn },
        })
    } else if (config.type === 'customization') {
        client.sendNotification(DidChangeConfigurationNotification.type.method, {
            section: 'aws.q',
            settings: { customization: config.customization },
        })
    } else if (config.type === 'logging') {
        client.sendNotification(DidChangeConfigurationNotification.type.method, {
            section: 'aws.logLevel',
        })
    }
}
type ProfileConfig = {
    type: 'profile'
    profileArn: string | undefined
}
type CustomizationConfig = {
    type: 'customization'
    customization: string | undefined
}
interface LoggingConfig extends ReturnType<typeof getLspLogSettings> {
    type: 'logging'
}

type QConfigs = ProfileConfig | CustomizationConfig | LoggingConfig
