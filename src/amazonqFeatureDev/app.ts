/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { UIMessageListener } from './views/actions/uiMessageListener'
import { ChatControllerEventEmitters, FeatureDevController } from './controllers/chat/controller'
import { AmazonQAppInitContext } from '../amazonq/apps/initContext'
import { MessagePublisher } from '../amazonq/messages/messagePublisher'
import { MessageListener } from '../amazonq/messages/messageListener'
import { Messenger } from './controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from './views/connector/connector'
import { ChatSessionStorage } from './storages/chatSession'
import { AuthUtil, getChatAuthState } from '../codewhisperer/util/authUtil'
import { debounce } from 'lodash'

export function init(appContext: AmazonQAppInitContext) {
    const featureDevChatControllerEventEmitters: ChatControllerEventEmitters = {
        processHumanChatMessage: new vscode.EventEmitter<any>(),
        followUpClicked: new vscode.EventEmitter<any>(),
        openDiff: new vscode.EventEmitter<any>(),
        processChatItemVotedMessage: new vscode.EventEmitter<any>(),
        stopResponse: new vscode.EventEmitter<any>(),
        tabOpened: new vscode.EventEmitter<any>(),
        tabClosed: new vscode.EventEmitter<any>(),
        authClicked: new vscode.EventEmitter<any>(),
        processResponseBodyLinkClick: new vscode.EventEmitter<any>(),
        insertCodeAtPositionClicked: new vscode.EventEmitter<any>(),
    }

    const messenger = new Messenger(new AppToWebViewMessageDispatcher(appContext.getAppsToWebViewMessagePublisher()))
    const sessionStorage = new ChatSessionStorage(messenger)

    new FeatureDevController(
        featureDevChatControllerEventEmitters,
        messenger,
        sessionStorage,
        appContext.onDidChangeAmazonQVisibility.event
    )

    const featureDevChatUIInputEventEmitter = new vscode.EventEmitter<any>()

    new UIMessageListener({
        chatControllerEventEmitters: featureDevChatControllerEventEmitters,
        webViewMessageListener: new MessageListener<any>(featureDevChatUIInputEventEmitter),
    })

    appContext.registerWebViewToAppMessagePublisher(
        new MessagePublisher<any>(featureDevChatUIInputEventEmitter),
        'featuredev'
    )

    const debouncedEvent = debounce(async () => {
        const authenticated = (await getChatAuthState()).amazonQ === 'connected'
        let authenticatingSessionIDs: string[] = []
        if (authenticated) {
            const authenticatingSessions = sessionStorage.getAuthenticatingSessions()

            authenticatingSessionIDs = authenticatingSessions.map(session => session.tabID)

            // We've already authenticated these sessions
            authenticatingSessions.forEach(session => (session.isAuthenticating = false))
        }

        messenger.sendAuthenticationUpdate(authenticated, authenticatingSessionIDs)
    }, 500)

    AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(() => {
        return debouncedEvent()
    })
}
