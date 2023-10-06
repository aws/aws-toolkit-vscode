/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'stream'

export const cwChatEvent = 'cwChatEvent'

export interface ActionsListenerProps {
    chatControllerEventEmitter: EventEmitter
    inputUIEventEmitter: EventEmitter
}

export class ActionListener {
    private chatControllerEventsEmmiter: EventEmitter | undefined
    private inputUIEventEmmiter: EventEmitter | undefined

    public bind(props: ActionsListenerProps) {
        this.chatControllerEventsEmmiter = props.chatControllerEventEmitter
        this.inputUIEventEmmiter = props.inputUIEventEmitter

        this.inputUIEventEmmiter.on(cwChatEvent, msg => {
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
        this.chatControllerEventsEmmiter?.emit('processHumanChatMessage', {
            message: msg.chatMessage,
            tabID: msg.tabID,
        })
    }
}
