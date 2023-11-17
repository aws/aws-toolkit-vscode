/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window } from 'vscode'
import { AmazonQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { init as featureDevChatAppInit } from '../amazonqFeatureDev/app'
import { AmazonQAppInitContext, DefaultAmazonQAppInitContext } from './apps/initContext'
import { featureDevEnabled } from '../amazonqFeatureDev/config'
import { Commands } from '../shared/vscode/commands2'
import { MessagePublisher } from './messages/messagePublisher'
import { welcome } from './onboardingPage'
import { learnMoreAmazonQCommand, switchToAmazonQCommand } from './explorer/amazonQChildrenNodes'
import { ExtContext } from '../shared/extensions'
import { focusAmazonQPanel } from '../codewhisperer/commands/basicCommands'

export async function activate(context: ExtContext) {
    const appInitContext = new DefaultAmazonQAppInitContext()

    registerApps(appInitContext)

    const provider = new AmazonQChatViewProvider(
        context.extensionContext,
        appInitContext.getWebViewToAppsMessagePublishers(),
        appInitContext.getAppsToWebViewMessageListener(),
        appInitContext.onDidChangeAmazonQVisibility
    )

    const cwcWebViewToAppsPublisher = appInitContext.getWebViewToAppsMessagePublishers().get('cwc')!

    context.extensionContext.subscriptions.push(
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),

        amazonQWelcomeCommand.register(context.extensionContext, cwcWebViewToAppsPublisher),

        learnMoreAmazonQCommand.register(),

        switchToAmazonQCommand.register()
    )
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    if (featureDevEnabled) {
        featureDevChatAppInit(appInitContext)
    }
}

export const amazonQWelcomeCommand = Commands.declare(
    'aws.amazonq.welcome',
    (context: ExtensionContext, publisher: MessagePublisher<any>) => () => {
        focusAmazonQPanel()
        welcome(context, publisher)
    }
)
