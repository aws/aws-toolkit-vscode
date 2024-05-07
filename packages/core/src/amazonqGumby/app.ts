/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AmazonQAppInitContext } from '../amazonq/apps/initContext'
import { MessagePublisher } from '../amazonq/messages/messagePublisher'
import { MessageListener } from '../amazonq/messages/messageListener'
import { ChatControllerEventEmitters, GumbyController } from './chat/controller/controller'
import { AppToWebViewMessageDispatcher } from './chat/views/connector/connector'
import { Messenger } from './chat/controller/messenger/messenger'
import { UIMessageListener } from './chat/views/actions/uiMessageListener'
import { debounce } from 'lodash'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import { showTransformationHub } from './commands'
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
        processHumanChatMessage: new vscode.EventEmitter<any>(),
        linkClicked: new vscode.EventEmitter<any>(),
    }

    const dispatcher = new AppToWebViewMessageDispatcher(appContext.getAppsToWebViewMessagePublisher())
    const messenger = new Messenger(dispatcher)

    new GumbyController(gumbyChatControllerEventEmitters, messenger, appContext.onDidChangeAmazonQVisibility.event)

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
        const authenticated = (await AuthUtil.instance.getChatAuthState()).amazonQ === 'connected'
        let authenticatingSessionID = ''

        if (authenticated) {
            const session = sessionStorage.getSession()

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

    showTransformationHub.register()

    transformByQState.setChatControllers(gumbyChatControllerEventEmitters)
}
