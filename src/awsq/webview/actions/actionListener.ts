/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Webview } from 'vscode'
import { EventEmitter } from 'stream'
import { cwChatEvent } from '../../../codewhispererChat/view/actions/actionListener'

export interface ActionsListenerProps {
    cwChatUIInputEventEmitter: EventEmitter
    webview: Webview
}

export class ActionListener {
    private cwChatUIInputEventEmitter: EventEmitter | undefined

    public bind(props: ActionsListenerProps) {
        this.cwChatUIInputEventEmitter = props.cwChatUIInputEventEmitter
        props.webview.onDidReceiveMessage(msg => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: any) {
        // TODO:
        // switch msg.tabType
        this.cwChatUIInputEventEmitter?.emit(cwChatEvent, msg)
    }
}
