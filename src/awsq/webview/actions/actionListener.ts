/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Webview, EventEmitter } from 'vscode'

export interface AppsUIInputEventEmitters {
    readonly cwChat: EventEmitter<any>
}

export interface ActionsListenerProps {
    readonly appsUIInputEventEmitters: AppsUIInputEventEmitters
    readonly webview: Webview
}

export class ActionListener {
    private appsUIInputEventEmitters: AppsUIInputEventEmitters | undefined

    public bind(props: ActionsListenerProps) {
        this.appsUIInputEventEmitters = props.appsUIInputEventEmitters
        props.webview.onDidReceiveMessage(msg => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: any) {
        // TODO:
        // switch msg.tabType
        this.appsUIInputEventEmitters?.cwChat.fire(msg)
    }
}
