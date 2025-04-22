/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    AmazonQAppInitContext,
    MessagePublisher,
    MessageListener,
    focusAmazonQPanel,
    DefaultAmazonQAppInitContext,
} from 'aws-core-vscode/amazonq'
import { AuthUtil, codeScanState, onDemandFileScanState } from 'aws-core-vscode/codewhisperer'
import { ScanChatControllerEventEmitters, ChatSessionManager } from 'aws-core-vscode/amazonqScan'
import { ScanController } from './chat/controller/controller'
import { AppToWebViewMessageDispatcher } from './chat/views/connector/connector'
import { Messenger } from './chat/controller/messenger/messenger'
import { UIMessageListener } from './chat/views/actions/uiMessageListener'
import { debounce } from 'lodash'
import { Commands, placeholder } from 'aws-core-vscode/shared'

export function init(appContext: AmazonQAppInitContext) {
    const scanChatControllerEventEmitters: ScanChatControllerEventEmitters = {
        authClicked: new vscode.EventEmitter<any>(),
        tabOpened: new vscode.EventEmitter<any>(),
        tabClosed: new vscode.EventEmitter<any>(),
        runScan: new vscode.EventEmitter<any>(),
        formActionClicked: new vscode.EventEmitter<any>(),
        errorThrown: new vscode.EventEmitter<any>(),
        showSecurityScan: new vscode.EventEmitter<any>(),
        scanStopped: new vscode.EventEmitter<any>(),
        followUpClicked: new vscode.EventEmitter<any>(),
        scanProgress: new vscode.EventEmitter<any>(),
        processResponseBodyLinkClick: new vscode.EventEmitter<any>(),
        fileClicked: new vscode.EventEmitter<any>(),
        scanCancelled: new vscode.EventEmitter<any>(),
        processChatItemVotedMessage: new vscode.EventEmitter<any>(),
    }
    const dispatcher = new AppToWebViewMessageDispatcher(appContext.getAppsToWebViewMessagePublisher())
    const messenger = new Messenger(dispatcher)

    new ScanController(scanChatControllerEventEmitters, messenger, appContext.onDidChangeAmazonQVisibility.event)

    const scanChatUIInputEventEmitter = new vscode.EventEmitter<any>()

    new UIMessageListener({
        chatControllerEventEmitters: scanChatControllerEventEmitters,
        webViewMessageListener: new MessageListener<any>(scanChatUIInputEventEmitter),
    })

    appContext.registerWebViewToAppMessagePublisher(new MessagePublisher<any>(scanChatUIInputEventEmitter), 'review')

    const debouncedEvent = debounce(async () => {
        const authenticated = (await AuthUtil.instance.getChatAuthState()).amazonQ === 'connected'
        let authenticatingSessionID = ''

        if (authenticated) {
            const session = ChatSessionManager.Instance.getSession()

            if (session.isTabOpen() && session.isAuthenticating) {
                authenticatingSessionID = session.tabID!
                session.isAuthenticating = false
            }
        }

        messenger.sendAuthenticationUpdate(authenticated, [authenticatingSessionID])
    }, 500)

    AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(() => {
        return debouncedEvent()
    })
    AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(() => {
        return debouncedEvent()
    })

    Commands.register('aws.amazonq.security.scan-statusbar', async () => {
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.notifyReauthenticate()
        }
        return focusAmazonQPanel.execute(placeholder, 'amazonq.security.scan').then(() => {
            DefaultAmazonQAppInitContext.instance.getAppsToWebViewMessagePublisher().publish({
                sender: 'amazonqCore',
                command: 'review',
            })
        })
    })

    codeScanState.setChatControllers(scanChatControllerEventEmitters)
    onDemandFileScanState.setChatControllers(scanChatControllerEventEmitters)
}
