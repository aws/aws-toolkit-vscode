/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { ExtensionUtilities, isCloud9 } from '../shared/extensionUtilities'
import {
    CompileContext,
    DataFromOptions,
    OptionsToProtocol,
    OutputFromOptions,
    registerWebviewServer,
    SubmitFromOptions,
    WebviewCompileOptions,
} from './server'

interface WebviewParams {
    id: string
    name: string
    webviewJs: string
    persistWithoutFocus?: boolean
    cssFiles?: string[]
    libFiles?: string[]
    /** View column to initally show the view in. Defaults to split view. */
    viewColumn?: vscode.ViewColumn
}

/**
 * A compiled webview. This is the base interface from which all views are derived from.
 */
export interface VueWebview<Options extends WebviewCompileOptions> {
    /**
     * Shows the webview with the given parameters.
     *
     * @param data Data to initialize the view with. The exact meaning of this is highly dependent on the view type.
     *
     * @returns A Promise that is resolved once the view is closed. Can return an object if the view supports `submit`.
     */
    show(data?: DataFromOptions<Options>): Promise<OutputFromOptions<Options> | undefined>
    /**
     * Event emitters registered by the view. Can be used by backend logic to trigger events in the view.
     */
    readonly emitters: Options['events']
    /**
     * This exists only for use by the client.
     * Trying to access it on the backend will result in an error.
     */
    readonly protocol: OptionsToProtocol<Options>
}

/**
 * Generates an anonymous class whose instances have the interface {@link VueWebview}.
 *
 * You can give this class a name by extending off of it:
 * ```ts
 * export class MyWebview extends compileVueWebview(...) {}
 * const view = new MyWebview()
 * view.show()
 * ```
 *
 * @param params Required parameters are defined by {@link WebviewParams}, optional parameters are defined by {@link WebviewCompileOptions}
 *
 * @returns An anonymous class that can instantiate instances of {@link VueWebview}.
 */
export function compileVueWebview<Options extends WebviewCompileOptions>(
    params: WebviewParams & Options & { commands?: CompileContext<Options> }
): { new (context: ExtContext): VueWebview<Options> } {
    return class implements VueWebview<Options> {
        public get protocol(): OptionsToProtocol<Options> {
            throw new Error('Cannot access the webview protocol on the backend.')
        }
        public readonly emitters: Options['events']
        public async show(data?: DataFromOptions<Options>): Promise<OutputFromOptions<Options> | undefined> {
            await params.validateData?.(data)
            const panel = createVueWebview({ ...params, context: this.context })
            return new Promise<OutputFromOptions<Options> | undefined>((resolve, reject) => {
                const onDispose = panel.onDidDispose(() => resolve(undefined))

                if (params.commands) {
                    const submit = async (response: SubmitFromOptions<Options>) => {
                        const result = await params.validateSubmit?.(response)
                        if (result) {
                            onDispose.dispose()
                            panel.dispose()
                            resolve(result)
                        }
                    }
                    const init = async () => data
                    const modifiedWebview = Object.assign(panel.webview, {
                        dispose: () => panel.dispose(),
                        context: this.context,
                        emitters: this.emitters,
                        arguments: data,
                    })
                    registerWebviewServer(modifiedWebview, { init, submit, ...params.commands, ...this.emitters })
                }
            })
        }
        constructor(private readonly context: ExtContext) {
            const copyEmitters = {} as Options['events']
            Object.keys(params.events ?? {}).forEach(k => {
                Object.assign(copyEmitters, { [k]: new vscode.EventEmitter() })
            })
            this.emitters = copyEmitters
        }
    } as any
}

function createVueWebview(params: WebviewParams & { context: ExtContext }): vscode.WebviewPanel {
    const context = params.context.extensionContext
    const libsPath: string = path.join(context.extensionPath, 'media', 'libs')
    const jsPath: string = path.join(context.extensionPath, 'media', 'js')
    const cssPath: string = path.join(context.extensionPath, 'media', 'css')
    const webviewPath: string = path.join(context.extensionPath, 'dist')
    const resourcesPath: string = path.join(context.extensionPath, 'resources')

    const panel = vscode.window.createWebviewPanel(
        params.id,
        params.name,
        // Cloud9 opens the webview in the bottom pane unless a second pane already exists on the main level.
        isCloud9() ? vscode.ViewColumn.Two : params.viewColumn ?? vscode.ViewColumn.Beside,
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
        panel.webview
    ).concat(ExtensionUtilities.getFilesAsVsCodeResources(jsPath, ['loadVsCodeApi.js'], panel.webview))

    const loadCss = ExtensionUtilities.getFilesAsVsCodeResources(cssPath, [...(params.cssFiles ?? [])], panel.webview)

    let scripts: string = ''
    let stylesheets: string = ''

    loadLibs.forEach(element => {
        scripts = scripts.concat(`<script src="${element}"></script>\n\n`)
    })

    loadCss.forEach(element => {
        stylesheets = stylesheets.concat(`<link rel="stylesheet" href="${element}">\n\n`)
    })

    const mainScript = panel.webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, params.webviewJs)))

    panel.title = params.name
    panel.webview.html = resolveWebviewHtml({
        scripts,
        stylesheets,
        main: mainScript,
        webviewJs: params.webviewJs,
        cspSource: updateCspSource(panel.webview.cspSource),
    })

    return panel
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

// Updates the CSP source for webviews with an allowed source for AWS endpoints when running in
// Cloud9 environments. Possible this can be further scoped to specific C9 CDNs or removed entirely
// if C9 injects this.
export function updateCspSource(baseSource: string) {
    return isCloud9() ? `https://*.amazonaws.com ${baseSource}` : baseSource
}
