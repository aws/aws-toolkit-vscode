/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window, EventEmitter } from 'vscode'
import { AwsQChatViewProvider } from './webview/webView'
import { AppsUIInputEventEmitters } from './webview/actions/actionListener'
import { CWChatApp } from '../codewhispererChat/app'

export async function activate(context: ExtensionContext) {
    const uiOutputEventEmitter = new EventEmitter<any>()

    const appsUIInputEventEmitters: AppsUIInputEventEmitters = []

    // CWChat

    const cwChatUIInputEventEmmiter = new EventEmitter<any>()
    appsUIInputEventEmitters.push(cwChatUIInputEventEmmiter)

    const cwChatApp = new CWChatApp()

    cwChatApp.start(cwChatUIInputEventEmmiter, uiOutputEventEmitter)

    // TODO: WB

    const provider = new AwsQChatViewProvider(context, appsUIInputEventEmitters, uiOutputEventEmitter)

    context.subscriptions.push(
        window.registerWebviewViewProvider(AwsQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )
}
