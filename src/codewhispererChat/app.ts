/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { ChatController as CwChatController } from '../codewhispererChat/controllers/chat/controller'
import { ActionListener as CwChatActionListener } from '../codewhispererChat/view/actions/actionListener'

export class CWChatApp {
    public start(cwChatUIInputEventEmmiter: EventEmitter<any>, uiOutputEventEmitter: EventEmitter<any>) {
        const cwChatControllerEventEmitters = {
            processHumanChatMessage: new EventEmitter<any>(),
        }
        const chatController = new CwChatController(cwChatControllerEventEmitters, uiOutputEventEmitter)
        chatController.run()
        const cwChatActionListener = new CwChatActionListener()
        cwChatActionListener.bind({
            chatControllerEventEmitters: cwChatControllerEventEmitters,
            inputUIEventEmitter: cwChatUIInputEventEmmiter,
        })
    }
}
