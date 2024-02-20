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
import { Commands, VsCodeCommandArg } from '../shared/vscode/commands2'
import { MessagePublisher } from './messages/messagePublisher'
import { welcome } from './onboardingPage'
import { learnMoreAmazonQCommand, switchToAmazonQCommand } from './explorer/amazonQChildrenNodes'
import { activateBadge } from './util/viewBadgeHandler'
import { telemetry } from '../shared/telemetry/telemetry'
import { focusAmazonQPanel } from '../auth/ui/vue/show'
import { CommonAuthViewProvider } from '../login/webview/commonAuthViewProvider'

export async function activate(context: ExtensionContext) {
    const appInitContext = DefaultAmazonQAppInitContext.instance

    registerApps(appInitContext)

    const provider = new AmazonQChatViewProvider(
        context,
        appInitContext.getWebViewToAppsMessagePublishers(),
        appInitContext.getAppsToWebViewMessageListener(),
        appInitContext.onDidChangeAmazonQVisibility
    )
    const provider2 = new CommonAuthViewProvider(context, appInitContext.onDidChangeAmazonQVisibility)

    const cwcWebViewToAppsPublisher = appInitContext.getWebViewToAppsMessagePublishers().get('cwc')!

    context.subscriptions.push(
        window.registerWebviewViewProvider(CommonAuthViewProvider.viewType, provider2, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )

    amazonQWelcomeCommand.register(context, cwcWebViewToAppsPublisher)
    learnMoreAmazonQCommand.register()
    switchToAmazonQCommand.register()

    await activateBadge()
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    if (featureDevEnabled) {
        featureDevChatAppInit(appInitContext)
    }
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
