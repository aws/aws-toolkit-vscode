/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window } from 'vscode'
import { AwsQChatViewProvider } from './webview/webView'
import { ChatController as CwChatController } from '../codewhispererChat/controllers/chat/controller'
import { EventEmitter } from 'stream'
import { ActionListener as CwChatActionListener } from '../codewhispererChat/view/actions/actionListener'

export async function activate(context: ExtensionContext) {
    const uiOutputEventEmitter = new EventEmitter()
    const uiInputEventEmitter = new EventEmitter()

    // CWChat
    const cwChatControllerEventEmitter = new EventEmitter()
    const chatController = new CwChatController(cwChatControllerEventEmitter, uiOutputEventEmitter)
    chatController.run()
    const cwChatActionListener = new CwChatActionListener()
    cwChatActionListener.bind({
        chatControllerEventEmitter: cwChatControllerEventEmitter,
        inputUIEventEmitter: uiInputEventEmitter,
    })

    // TODO: WB

    const provider = new AwsQChatViewProvider(context, uiInputEventEmitter, uiOutputEventEmitter)

    context.subscriptions.push(
        window.registerWebviewViewProvider(AwsQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )
}
