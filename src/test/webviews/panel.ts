/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { WebviewClient } from '../../webviews/client'
import { VueWebviewPanel } from '../../webviews/main'
import { createTestClient } from './util'

/**
 * Swaps in the `webview` field with something we can manipulate.
 *
 * **This function mutates!**
 */
function hijackWebview<T extends { webview: vscode.Webview }>(target: T, webview: vscode.Webview): T {
    Object.defineProperty(target, 'webview', { get: () => webview })

    return target
}

/**
 * A very basic webview that can intercept messages produced by backend logic, simulating responses
 * produced by the frontend through {@link handler}.
 */
export class TestWebview implements vscode.Webview {
    private readonly _onDidReceiveMessage = new vscode.EventEmitter<any>()
    public readonly onDidReceiveMessage = this._onDidReceiveMessage.event

    public html = ''
    public cspSource = ''

    public constructor(
        protected readonly handler: (message: any) => any,
        public readonly options: vscode.WebviewOptions
    ) {}

    public get messageEmitter() {
        return this._onDidReceiveMessage
    }

    public asWebviewUri(localResource: vscode.Uri): vscode.Uri {
        return localResource
    }

    public async postMessage(message: any): Promise<boolean> {
        try {
            await this.handler(message)

            return true
        } catch (e) {
            getLogger().error(`Unexpected error from webview message handler: %O`, e)
            return false
        }
    }
}

export type TestWebviewPanel<T extends VueWebviewPanel<any>> = vscode.WebviewPanel & {
    readonly client: WebviewClient<T['protocol']>
}

/**
 * Swaps in the `webview` component of a panel with our own. This doesn't affect how VS Code treats the panel, but it
 * does give us control over interactions within our code.
 */
export function instrumentPanel(panel: vscode.WebviewPanel): TestWebviewPanel<any> {
    const receiver = new vscode.EventEmitter<any>()
    const webview = new TestWebview(receiver.fire.bind(receiver), panel.webview.options)
    const client = createTestClient(receiver.event, webview.messageEmitter)
    const modifiedPanel = Object.assign(hijackWebview(panel, webview), { client })

    return modifiedPanel
}
