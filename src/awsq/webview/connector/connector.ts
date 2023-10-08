/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Webview, EventEmitter } from 'vscode'

export class Connector {
    constructor(private readonly webView: Webview, private readonly eventEmitter: EventEmitter<any>) {
        this.webView = webView
        this.eventEmitter = eventEmitter

        this.eventEmitter.event(data => {
            this.postMessage(data)
        })
    }

    public postMessage(msg: any) {
        this.webView.postMessage(JSON.stringify(msg))
    }
}
