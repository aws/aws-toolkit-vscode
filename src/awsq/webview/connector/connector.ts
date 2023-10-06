/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'stream'
import { Webview } from 'vscode'

export class Connector {
    constructor(private readonly webView: Webview, private readonly eventEmitter: EventEmitter) {
        this.webView = webView
        this.eventEmitter = eventEmitter

        this.eventEmitter.addListener('postMessage', data => {
            this.postMessage(data)
        })
    }

    public postMessage(msg: any) {
        this.webView.postMessage(JSON.stringify(msg))
    }
}
