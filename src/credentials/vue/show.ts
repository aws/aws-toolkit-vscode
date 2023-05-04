/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module sets up the necessary components
 * for the webview to be shown.
 */

import { getIdeProperties, isCloud9 } from '../../shared/extensionUtilities'
import { VueWebview } from '../../webviews/main'
import * as vscode from 'vscode'

class AuthWebview extends VueWebview {
    public override id: string = 'authWebview'
    public override source: string = 'src/credentials/vue/index.js'
}

const Panel = VueWebview.compilePanel(AuthWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined
let submitPromise: Promise<void> | undefined

export async function showAuthWebview(ctx: vscode.ExtensionContext): Promise<void> {
    submitPromise ??= new Promise<void>((resolve, reject) => {
        activePanel ??= new Panel(ctx)
    })

    const webview = await activePanel!.show({
        title: `Add Connection to ${getIdeProperties().company}`,
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        subscriptions = [
            webview.onDidDispose(() => {
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
                submitPromise = undefined
            }),
        ]
    }

    return submitPromise
}
