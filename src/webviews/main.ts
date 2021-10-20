/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { ExtensionUtilities, isCloud9 } from '../shared/extensionUtilities'
import { Commands, registerWebviewServer } from './server'

interface WebviewParams<T, U> {
    id: string
    name: string
    webviewJs: string
    context: ExtContext
    persistWithoutFocus?: boolean
    cssFiles?: string[]
    jsFiles?: string[]
    libFiles?: string[]
    onSubmit?: (result?: U) => void
    commands?: Commands<T, U>
}

export async function createVueWebview<T, U = void>(params: WebviewParams<T, U>): Promise<vscode.WebviewPanel> {
    const context = params.context.extensionContext
    const libsPath: string = path.join(context.extensionPath, 'media', 'libs')
    const jsPath: string = path.join(context.extensionPath, 'media', 'js')
    const cssPath: string = path.join(context.extensionPath, 'media', 'css')
    const webviewPath: string = path.join(context.extensionPath, 'dist')
    const resourcesPath: string = path.join(context.extensionPath, 'resources')

    const view = vscode.window.createWebviewPanel(
        params.id,
        params.name,
        // Cloud9 opens the webview in the bottom pane unless a second pane already exists on the main level.
        isCloud9() ? vscode.ViewColumn.Two : vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [
                vscode.Uri.file(libsPath),
                vscode.Uri.file(jsPath),
                vscode.Uri.file(cssPath),
                vscode.Uri.file(webviewPath),
                vscode.Uri.file(resourcesPath),
            ],
            // HACK: Cloud9 does not have get/setState support. Remove when it does.
            retainContextWhenHidden: isCloud9() ? true : params.persistWithoutFocus,
        }
    )

    const loadLibs = ExtensionUtilities.getFilesAsVsCodeResources(
        libsPath,
        ['vue.min.js', ...(params.libFiles ?? [])],
        view.webview
    ).concat(
        ExtensionUtilities.getFilesAsVsCodeResources(
            jsPath,
            ['loadVsCodeApi.js', ...(params.jsFiles ?? [])],
            view.webview
        )
    )

    const loadCss = ExtensionUtilities.getFilesAsVsCodeResources(cssPath, [...(params.cssFiles ?? [])], view.webview)

    let scripts: string = ''
    let stylesheets: string = ''

    loadLibs.forEach(element => {
        scripts = scripts.concat(`<script src="${element}"></script>\n\n`)
    })

    loadCss.forEach(element => {
        stylesheets = stylesheets.concat(`<link rel="stylesheet" href="${element}">\n\n`)
    })

    const mainScript = view.webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, params.webviewJs)))

    view.title = params.name
    view.webview.html = resolveWebviewHtml({
        scripts,
        stylesheets,
        main: mainScript,
        webviewJs: params.webviewJs,
        cspSource: view.webview.cspSource,
    })

    if (params.commands) {
        const submitCb = params.commands.submit
        params.commands.submit = async result => {
            await submitCb?.(result)
            params.onSubmit?.(result)
            view.dispose()
        }
        const modifiedWebview = Object.assign(view.webview, { dispose: () => view.dispose(), context: params.context })
        registerWebviewServer(modifiedWebview, params.commands)
    }

    return view
}

/**
 * Resolves the webview HTML based off whether we're running from a development server or bundled extension.
 */
function resolveWebviewHtml(params: {
    scripts: string
    stylesheets: string
    cspSource: string
    webviewJs: string
    main: vscode.Uri
}): string {
    const resolvedParams = { ...params, connectSource: 'none' }
    const LOCAL_SERVER = process.env.WEBPACK_DEVELOPER_SERVER

    if (LOCAL_SERVER) {
        const local = vscode.Uri.parse(LOCAL_SERVER)
        resolvedParams.cspSource = `${params.cspSource} ${local.toString()}`
        resolvedParams.main = local.with({ path: `/${params.webviewJs}` })
        resolvedParams.connectSource = `'self' ws:`
    }

    return `<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <meta
            http-equiv="Content-Security-Policy"
            content=
                "default-src 'none';
                connect-src ${resolvedParams.connectSource};
                img-src ${resolvedParams.cspSource} https:;
                script-src ${resolvedParams.cspSource};
                style-src ${resolvedParams.cspSource} 'unsafe-inline';
                font-src 'self' data:;"
        >
    </head>
    <body>
        <div id="vue-app"></div>
        <!-- Dependencies -->
        ${resolvedParams.scripts}
        ${resolvedParams.stylesheets}
        <!-- Main -->
        <script src="${resolvedParams.main}"></script>
    </body>
</html>`
}
