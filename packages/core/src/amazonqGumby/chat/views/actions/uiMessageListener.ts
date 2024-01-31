/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageListener } from '../../../../amazonq/messages/messageListener'
import { ExtensionMessage } from '../../../../amazonq/webview/ui/commands'
import { ChatControllerEventEmitters } from '../../controller/controller'

export interface UIMessageListenerProps {
    readonly chatControllerEventEmitters: ChatControllerEventEmitters
    readonly webViewMessageListener: MessageListener<any>
}

export class UIMessageListener {
    private gumbyControllerEventsEmitters: ChatControllerEventEmitters | undefined
    private webViewMessageListener: MessageListener<any>

    constructor(props: UIMessageListenerProps) {
        this.gumbyControllerEventsEmitters = props.chatControllerEventEmitters
        this.webViewMessageListener = props.webViewMessageListener

        // Now we are listening to events that get sent from amazonq/webview/actions/actionListener (e.g. the tab)
        this.webViewMessageListener.onMessage(msg => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: ExtensionMessage) {
        console.log(`gumby UI Message listener: ${msg.command}`)
        switch (msg.command) {
            case 'transform':
                this.transform(msg)
                break
            case 'new-tab-was-created':
                this.tabOpened(msg)
                break
            case 'tab-was-removed':
                this.tabClosed(msg)
                break
            case 'auth-follow-up-was-clicked':
                this.authClicked(msg)
                break
            case 'form-action-click':
                this.formActionClicked(msg)
                break
        }
    }

    private transform(msg: any) {
        this.gumbyControllerEventsEmitters?.transformSelected.fire({
            tabID: msg.tabID,
        })
    }

    private tabOpened(msg: any) {
        this.gumbyControllerEventsEmitters?.tabOpened.fire({
            tabID: msg.tabID,
        })
    }

    private tabClosed(msg: any) {
        this.gumbyControllerEventsEmitters?.tabClosed.fire({
            tabID: msg.tabID,
        })
    }

    private authClicked(msg: any) {
        this.gumbyControllerEventsEmitters?.authClicked.fire({
            tabID: msg.tabID,
            authType: msg.authType,
        })
    }

    private formActionClicked(msg: any) {
        this.gumbyControllerEventsEmitters?.formActionClicked.fire({
            ...msg,
        })
    }
}
