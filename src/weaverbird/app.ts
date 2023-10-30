/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { UIMessageListener } from './views/actions/uiMessageListener'
import { WeaverbirdController } from './controllers/chat/controller'
import { AwsQAppInitContext } from '../awsq/apps/initContext'
import { MessagePublisher } from '../awsq/messages/messagePublisher'
import { MessageListener } from '../awsq/messages/messageListener'
import { fromQueryToParameters } from '../shared/utilities/uriUtils'
import { getLogger } from '../shared/logger'
import { TabIdNotFoundError } from './errors'
import { weaverbirdScheme } from './constants'
import { Messenger } from './controllers/chat/messenger/messenger'
import { AppToWebViewMessageDispatcher } from './views/connector/connector'
import globals from '../shared/extensionGlobals'
import { ChatSessionStorage } from './storages/chatSession'

export function init(appContext: AwsQAppInitContext) {
    const weaverbirdChatControllerEventEmitters = {
        processHumanChatMessage: new vscode.EventEmitter<any>(),
        followUpClicked: new vscode.EventEmitter<any>(),
        openDiff: new vscode.EventEmitter<any>(),
        stopResponse: new vscode.EventEmitter<any>(),
        tabOpened: new vscode.EventEmitter<any>(),
        tabClosed: new vscode.EventEmitter<any>(),
    }

    const messenger = new Messenger(new AppToWebViewMessageDispatcher(appContext.getAppsToWebViewMessagePublisher()))
    const sessionStorage = new ChatSessionStorage(messenger)

    new WeaverbirdController(weaverbirdChatControllerEventEmitters, messenger, sessionStorage)

    const weaverbirdProvider = new (class implements vscode.TextDocumentContentProvider {
        async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
            const params = fromQueryToParameters(uri.query)

            const tabID = params.get('tabID')
            if (!tabID) {
                getLogger().error(`Unable to find tabID from ${uri.toString()}`)
                throw new TabIdNotFoundError(uri.toString())
            }

            const session = await sessionStorage.getSession(tabID)
            const content = await session.config.fs.readFile(uri)
            const decodedContent = new TextDecoder().decode(content)
            return decodedContent
        }
    })()

    const textDocumentProvider = vscode.workspace.registerTextDocumentContentProvider(
        weaverbirdScheme,
        weaverbirdProvider
    )

    globals.context.subscriptions.push(textDocumentProvider)

    const weaverbirdChatUIInputEventEmitter = new vscode.EventEmitter<any>()

    new UIMessageListener({
        chatControllerEventEmitters: weaverbirdChatControllerEventEmitters,
        webViewMessageListener: new MessageListener<any>(weaverbirdChatUIInputEventEmitter),
    })

    appContext.registerWebViewToAppMessagePublisher(new MessagePublisher<any>(weaverbirdChatUIInputEventEmitter), 'wb')
}
