/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { ChatControllerEventEmitters } from '../../controllers/chat/controller'

export interface ActionsListenerProps {
    readonly chatControllerEventEmitters: ChatControllerEventEmitters
    readonly inputUIEventEmitter: EventEmitter<any>
}

export class ActionListener {
    private chatControllerEventsEmmiters: ChatControllerEventEmitters | undefined
    private inputUIEventEmmiter: EventEmitter<any> | undefined

    public bind(props: ActionsListenerProps) {
        this.chatControllerEventsEmmiters = props.chatControllerEventEmitters
        this.inputUIEventEmmiter = props.inputUIEventEmitter

        this.inputUIEventEmmiter.event(msg => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: any) {
        switch (msg.command) {
            case 'processChatMessage':
                this.processChatMessage(msg)
                break
        }
    }

    private processChatMessage(msg: any) {
        this.chatControllerEventsEmmiters?.processHumanChatMessage.fire({
            message: msg.chatMessage,
            tabID: msg.tabID,
        })
    }
}
