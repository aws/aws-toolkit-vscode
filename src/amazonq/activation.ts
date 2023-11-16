/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtensionContext, window } from 'vscode'
import { AmazonQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { init as weaverbirdChatAppInit } from '../weaverbird/app'
import { AmazonQAppInitContext, DefaultAmazonQAppInitContext } from './apps/initContext'
import { weaverbirdEnabled } from '../weaverbird/config'
import { Commands } from '../shared/vscode/commands2'
import { MessagePublisher } from './messages/messagePublisher'
import { welcome } from './onboardingPage'
import { TransformationHubViewProvider } from '../codewhisperer/service/transformationHubViewProvider'
import { learnMoreAmazonQCommand, switchToAmazonQCommand } from './explorer/amazonQChildrenNodes'
import { showTransformByQ, showTransformationHub } from '../codewhisperer/commands/basicCommands'
import { ExtContext } from '../shared/extensions'
import { startTransformByQWithProgress, confirmStopTransformByQ } from '../codewhisperer/commands/startTransformByQ'
import { transformByQState } from '../codewhisperer/models/model'
import * as CodeWhispererConstants from '../codewhisperer/models/constants'

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

    const transformationHubViewProvider = new TransformationHubViewProvider()

    context.extensionContext.subscriptions.push(
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),

        showTransformByQ.register(context),

        showTransformationHub.register(),
    
        vscode.window.registerWebviewViewProvider('aws.amazonq.transformationHub', transformationHubViewProvider),
    
        Commands.register('aws.amazonq.startTransformationInHub', async () => {
            await startTransformByQWithProgress()
        }),
    
        Commands.register('aws.amazonq.stopTransformationInHub', async () => {
            if (transformByQState.isRunning()) {
                confirmStopTransformByQ(transformByQState.getJobId())
            } else {
                vscode.window.showInformationMessage(CodeWhispererConstants.noOngoingJobMessage)
            }
        }),
    
        Commands.register('aws.amazonq.showHistoryInHub', async () => {
            transformationHubViewProvider.updateContent('job history')
        }),
    
        Commands.register('aws.amazonq.showPlanProgressInHub', async () => {
            transformationHubViewProvider.updateContent('plan progress')
        }),
    
        Commands.register('aws.amazonq.showTransformationPlanInHub', async () => {
            vscode.commands.executeCommand('markdown.showPreviewToSide', vscode.Uri.file(transformByQState.getPlanFilePath()))
        }),

        amazonQWelcomeCommand.register(context.extensionContext, cwcWebViewToAppsPublisher),

        learnMoreAmazonQCommand.register(),

        switchToAmazonQCommand.register()
    )
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    if (weaverbirdEnabled) {
        weaverbirdChatAppInit(appInitContext)
    }
}

export const amazonQWelcomeCommand = Commands.declare(
    'aws.amazonq.welcome',
    (context: ExtensionContext, publisher: MessagePublisher<any>) => () => {
        welcome(context, publisher)
    }
)
