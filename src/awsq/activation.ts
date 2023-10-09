/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window, EventEmitter } from 'vscode'
import { AwsQChatViewProvider } from './webview/webView'
import { ChatController as CwChatController } from '../codewhispererChat/controllers/chat/controller'
import { ActionListener as CwChatActionListener } from '../codewhispererChat/view/actions/actionListener'
import { AppsUIInputEventEmitters } from './webview/actions/actionListener'

export async function activate(context: ExtensionContext) {
    const uiOutputEventEmitter = new EventEmitter<any>()

    const appsUIInputEventEmitters: AppsUIInputEventEmitters = []

    // CWChat
    const cwChatControllerEventEmitters = {
        processHumanChatMessage: new EventEmitter<any>(),
    }
    const chatController = new CwChatController(cwChatControllerEventEmitters, uiOutputEventEmitter)
    chatController.run()
    const cwChatActionListener = new CwChatActionListener()
    const cwChatUIInputEventEmmiter = new EventEmitter<any>()
    appsUIInputEventEmitters.push(cwChatUIInputEventEmmiter)
    cwChatActionListener.bind({
        chatControllerEventEmitters: cwChatControllerEventEmitters,
        inputUIEventEmitter: cwChatUIInputEventEmmiter,
    })

    // TODO: WB

    const provider = new AwsQChatViewProvider(context, appsUIInputEventEmitters, uiOutputEventEmitter)

    context.subscriptions.push(
        window.registerWebviewViewProvider(AwsQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )
}
