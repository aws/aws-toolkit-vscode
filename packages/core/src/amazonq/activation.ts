/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window } from 'vscode'
import { AmazonQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { init as featureDevChatAppInit } from '../amazonqFeatureDev/app'
import { init as gumbyChatAppInit } from '../amazonqGumby/app'
import { AmazonQAppInitContext, DefaultAmazonQAppInitContext } from './apps/initContext'
import { Commands, VsCodeCommandArg } from '../shared/vscode/commands2'
import { MessagePublisher } from './messages/messagePublisher'
import { welcome } from './onboardingPage'
import { activateBadge } from './util/viewBadgeHandler'
import { telemetry } from '../shared/telemetry/telemetry'
import { focusAmazonQPanel } from '../auth/ui/vue/show'

export async function activate(context: ExtensionContext) {
    const appInitContext = DefaultAmazonQAppInitContext.instance

    registerApps(appInitContext)

    const provider = new AmazonQChatViewProvider(
        context,
        appInitContext.getWebViewToAppsMessagePublishers(),
        appInitContext.getAppsToWebViewMessageListener(),
        appInitContext.onDidChangeAmazonQVisibility
    )

    const cwcWebViewToAppsPublisher = appInitContext.getWebViewToAppsMessagePublishers().get('cwc')!

    context.subscriptions.push(
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )

    amazonQWelcomeCommand.register(context, cwcWebViewToAppsPublisher)

    await activateBadge()
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    featureDevChatAppInit(appInitContext)
    gumbyChatAppInit(appInitContext)
}

export const amazonQWelcomeCommand = Commands.declare(
    { id: 'aws.amazonq.welcome', compositeKey: { 1: 'source' } },
    (context: ExtensionContext, publisher: MessagePublisher<any>) => (_: VsCodeCommandArg, source: string) => {
        telemetry.ui_click.run(() => {
            void focusAmazonQPanel()
            welcome(context, publisher)
            telemetry.record({ elementId: 'toolkit_openedWelcomeToAmazonQPage', source })
        })
    }
)
