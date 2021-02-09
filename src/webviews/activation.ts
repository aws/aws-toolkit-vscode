/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { ExtensionUtilities } from '../shared/extensionUtilities'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    vscode.commands.registerCommand('aws.lambda.vueTest', async () => {
        await createVueWebview({
            id: 'create',
            name: 'VueTest',
            webviewJs: 'testVue.js',
            onDidReceiveMessageFunction: handleMessage,
            context,
        })
    })
}

export interface BackendToFrontend {
    newText: string
}

export interface FrontendToBackend {
    messageText: string
}

async function handleMessage(
    message: FrontendToBackend,
    postMessageFn: (response: BackendToFrontend) => Thenable<boolean>,
    destroyWebviewFn: () => any
): Promise<any> {
    // message handler here!
    // https://github.com/aws/aws-toolkit-vscode/blob/experiments/react-hooks/src/webviews/activation.ts#L39 for inspiration
    const val = await vscode.window.showInformationMessage(message.messageText, 'Reply', 'Close Webview')

    if (val === 'Reply') {
        const reply = await vscode.window.showInputBox({ prompt: 'Write somethin will ya?' })
        if (reply) {
            const success = await postMessageFn({ newText: reply })
            if (!success) {
                vscode.window.showInformationMessage('webview message fail')
            }
        } else {
            vscode.window.showInformationMessage('You should type something...')
        }
    } else if (val === 'Close Webview') {
        destroyWebviewFn()
    }
}

// everything over this should move to a different file!!! Potentially a different dir (leave the 'src/webviews' dir for webview-only utils)

interface WebviewParams {
    id: string
    name: string
    webviewJs: string
    context: vscode.ExtensionContext
    initialState?: any
    persistSessions?: boolean
    persistWithoutFocus?: boolean
    onDidReceiveMessageFunction(
        request: any,
        postMessageFn: (response: any) => Thenable<boolean>,
        destroyWebviewFn: () => any
    ): void
    onDidDisposeFunction?(): void
}

// TODO: add types for the state functions
export interface VsCode<T> {
    postMessage(output: T): void
    setState(state: any): void
    getState(): any | undefined
}

async function createVueWebview(params: WebviewParams) {
    const libsPath: string = path.join(params.context.extensionPath, 'media', 'libs')
    const jsPath: string = path.join(params.context.extensionPath, 'media', 'js')
    const cssPath: string = path.join(params.context.extensionPath, 'media', 'css')
    const webviewPath: string = path.join(params.context.extensionPath, 'compiledWebviews')

    const view = vscode.window.createWebviewPanel(params.id, params.name, vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.file(libsPath),
            vscode.Uri.file(jsPath),
            vscode.Uri.file(cssPath),
            vscode.Uri.file(webviewPath),
        ],
        retainContextWhenHidden: params.persistWithoutFocus,
    })

    const loadLibs = ExtensionUtilities.getFilesAsVsCodeResources(libsPath, ['vue.min.js'], view.webview).concat(
        ExtensionUtilities.getFilesAsVsCodeResources(jsPath, ['loadVsCodeApi.js'], view.webview)
    )

    let scripts: string = ''

    loadLibs.forEach(element => {
        scripts = scripts.concat(`<script src="${element}"></script>\n\n`)
    })

    const mainScript: vscode.Uri = view.webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, params.webviewJs)))

    view.title = params.name
    view.webview.html = `<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- how do we not require unsafe eval? -->
        <meta
            http-equiv="Content-Security-Policy"
            content=
                "default-src 'none';
                img-src ${view.webview.cspSource} https:;
                script-src ${view.webview.cspSource} 'unsafe-eval';
                style-src ${view.webview.cspSource};
                font-src 'self' data:;"
        >
    </head>
    <body>
        <div id="vueApp">{{ counter }}</div>
        <!-- Dependencies -->
        ${scripts}
        <!-- Main -->
        <script src="${mainScript}"></script>
    </body>
</html>`

    // message in initial state since we don't have access to the ReactDOM call at this level (since we webpack separately).
    // TODO: Is there a better way to do this?
    if (params.initialState) {
        view.webview.postMessage(params.initialState)
    }

    view.webview.onDidReceiveMessage(
        // type the any if necessary
        (message: any) => {
            params.onDidReceiveMessageFunction(
                message,
                response => view.webview.postMessage(response),
                // tslint:disable-next-line: no-unsafe-any
                () => view.dispose()
            )
        },
        undefined,
        params.context.subscriptions
    )

    view.onDidDispose(
        () => {
            if (params.onDidDisposeFunction) {
                params.onDidDisposeFunction()
            }
        },
        undefined,
        params.context.subscriptions
    )
}
