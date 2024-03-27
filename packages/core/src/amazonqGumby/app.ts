/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AmazonQAppInitContext } from '../amazonq/apps/initContext'
import { MessagePublisher } from '../amazonq/messages/messagePublisher'
import { MessageListener } from '../amazonq/messages/messageListener'
import { ChatSessionStorage } from './chat/storages/chatSession'
import { ChatControllerEventEmitters, GumbyController } from './chat/controller/controller'
import { AppToWebViewMessageDispatcher } from './chat/views/connector/connector'
import { Messenger } from './chat/controller/messenger/messenger'
import { UIMessageListener } from './chat/views/actions/uiMessageListener'
import { debounce } from 'lodash'
import { AuthUtil, getChatAuthState } from '../codewhisperer/util/authUtil'
import { showTransformByQ, showTransformationHub } from './commands'
import { transformByQState } from '../codewhisperer/models/model'

export function init(appContext: AmazonQAppInitContext) {
    const gumbyChatControllerEventEmitters: ChatControllerEventEmitters = {
        transformSelected: new vscode.EventEmitter<any>(),
        authClicked: new vscode.EventEmitter<any>(),
        formActionClicked: new vscode.EventEmitter<any>(),
        commandSentFromIDE: new vscode.EventEmitter<any>(),
        tabOpened: new vscode.EventEmitter<any>(),
        tabClosed: new vscode.EventEmitter<any>(),
        transformationFinished: new vscode.EventEmitter<any>(),
        humanInTheLoopIntervention: new vscode.EventEmitter<any>(),
    }

    const dispatcher = new AppToWebViewMessageDispatcher(appContext.getAppsToWebViewMessagePublisher())
    const messenger = new Messenger(dispatcher)
    const sessionStorage = new ChatSessionStorage(messenger)

    new GumbyController(
        gumbyChatControllerEventEmitters,
        messenger,
        sessionStorage,
        appContext.onDidChangeAmazonQVisibility.event
    )

    const featureDevChatUIInputEventEmitter = new vscode.EventEmitter<any>()

    new UIMessageListener({
        chatControllerEventEmitters: gumbyChatControllerEventEmitters,
        webViewMessageListener: new MessageListener<any>(featureDevChatUIInputEventEmitter),
    })

    appContext.registerWebViewToAppMessagePublisher(
        new MessagePublisher<any>(featureDevChatUIInputEventEmitter),
        'gumby'
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

    showTransformByQ.register(gumbyChatControllerEventEmitters)
    showTransformationHub.register()

    transformByQState.setChatControllers(gumbyChatControllerEventEmitters)
}
