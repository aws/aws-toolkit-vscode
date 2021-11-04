/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as semver from 'semver'
import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { ExtensionUtilities, isCloud9 } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger'
import {
    CompileContext,
    DataFromOptions,
    OptionsToProtocol,
    OutputFromOptions,
    PropsFromOptions,
    registerWebviewServer,
    SubmitFromOptions,
    WebviewCompileOptions,
} from './server'

interface WebviewParams {
    /** The entry-point into the webview. */
    webviewJs: string
    /** Styling sheets to use, applied to the entire webview. If none are provided, `base.css` is used by default. */
    cssFiles?: string[]
    /** Additional JS files to loaded in. */
    libFiles?: string[]
}

interface WebviewPanelParams extends WebviewParams {
    /** ID of the webview which should be globally unique per view. */
    id: string
    /** Title of the webview panel. This is shown in the editor tab. */
    title: string
    /** Preserves the webview when not focused by the user. This has a performance penalty and should be avoided. */
    retainContextWhenHidden?: boolean
    /**  View column to initally show the view in. Defaults to split view. */
    viewColumn?: vscode.ViewColumn
}

interface WebviewViewParams extends WebviewParams {
    /** ID of the webview which must be the same as the one used in `package.json`. */
    id: string
    /** Title of the view. Defaults to the title set in `package.json` is not provided. */
    title?: string
    /** Optional 'description' text applied to the title. */
    description?: string
}

export interface VueWebview<Options extends WebviewCompileOptions> {
    /**
     * Reset the view with new data. Resolves false if the view was unable to be cleared.
     */
    clear(...data: DataFromOptions<Options>): Promise<boolean>
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
 * A compiled webview created from {@link compileVueWebview}.
 */
export interface VueWebviewPanel<Options extends WebviewCompileOptions> extends VueWebview<Options> {
    /**
     * Shows the webview with the given parameters.
     *
     * @param data Data to initialize the view with. The exact meaning of this is highly dependent on the view type.
     *
     * @returns A Promise that is resolved once the view is closed. Can return an object if the view supports `submit`.
     */
    start(...data: DataFromOptions<Options>): Promise<OutputFromOptions<Options> | undefined>
    /**
     * The underlying {@link vscode.WebviewPanel}.
     *
     * This may be undefined if the view has not been started yet, or if the view was disposed.
     */
    readonly panel: vscode.WebviewPanel | undefined
}

export interface VueWebviewView<Options extends WebviewCompileOptions> extends VueWebview<Options> {
    /**
     * Finalizes the view registration with initial data.
     *
     * @param data Data to initialize the view with. The exact meaning of this is highly dependent on the view type.
     */
    start(...data: DataFromOptions<Options>): void
    /**
     * The underlying {@link vscode.WebviewView}.
     *
     * This may be undefined if the view has not been started yet, or if the view was disposed.
     */
    readonly view: vscode.WebviewView | undefined
}

function copyEmitters(events?: WebviewCompileOptions['events']): WebviewCompileOptions['events'] {
    const copyEmitters = {} as typeof events
    Object.keys(events ?? {}).forEach(k => {
        Object.assign(copyEmitters, { [k]: new vscode.EventEmitter() })
    })
    return copyEmitters
}

/**
 * Generates an anonymous class whose instances have the interface {@link VueWebviewPanel}.
 *
 * You can give this class a name by extending off of it:
 * ```ts
 * export class MyWebview extends compileVueWebview(...) {}
 * const view = new MyWebview()
 * view.show()
 * ```
 *
 * @param params Required parameters are defined by {@link WebviewPanelParams}, optional parameters are defined by {@link WebviewCompileOptions}
 *
 * @returns An anonymous class that can instantiate instances of {@link VueWebviewPanel}.
 */
export function compileVueWebview<Options extends WebviewCompileOptions>(
    params: WebviewPanelParams & Options & { commands?: CompileContext<Options> }
): { new (context: ExtContext): VueWebviewPanel<Options> } {
    return class implements VueWebviewPanel<Options> {
        private _panel?: vscode.WebviewPanel
        private initialData?: PropsFromOptions<Options>
        public readonly emitters: Options['events']

        public get panel() {
            return this._panel
        }

        public get protocol(): OptionsToProtocol<Options> {
            throw new Error('Cannot access the webview protocol on the backend.')
        }

        constructor(private readonly context: ExtContext) {
            this.emitters = copyEmitters(params.events)
        }

        public async start(...data: DataFromOptions<Options>): Promise<OutputFromOptions<Options> | undefined> {
            // TODO: potentially fix this type. If no `start` is defined then it defauls to the args
            // `start` may just be a required type, though sometimes we don't care about initializing the view
            this.initialData = (await params.start?.(...data)) ?? data
            this._panel = createWebviewPanel({ ...params, context: this.context })

            const panel = this._panel
            return new Promise<OutputFromOptions<Options> | undefined>(resolve => {
                const onDispose = panel.onDidDispose(() => resolve(undefined))

                if (params.commands) {
                    const submit = async (response: SubmitFromOptions<Options>) => {
                        const result = (await params.submit?.(response)) ?? response
                        if (result) {
                            onDispose.dispose()
                            panel.dispose()
                            resolve(result)
                        }
                    }
                    const init = async () => this.initialData
                    const modifiedWebview = Object.assign(panel.webview, {
                        dispose: () => panel.dispose(),
                        context: this.context,
                        emitters: this.emitters,
                    })
                    Object.defineProperty(modifiedWebview, 'data', { get: () => this.initialData })
                    registerWebviewServer(modifiedWebview, { init, submit, ...params.commands, ...this.emitters })
                }
            })
        }

        public async clear(...data: DataFromOptions<Options>): Promise<boolean> {
            this.initialData = (await params.start?.(...data)) ?? data
            return this._panel?.webview.postMessage({ command: '$clear' }) ?? false
        }
    } as any
}

const MIN_WEBVIEW_VIEW_VERSION = '1.50.0'

/**
 * This is the {@link vscode.WebviewView} version of {@link compileVueWebview}.
 *
 * The biggest difference is that only a single view per-id can exist at a time, while multiple panels can exist per-id.
 * Views also cannot register handlers for `submit`; any `submit` commands made by the fronend are ignored.
 *
 * @param params Required parameters are defined by {@link WebviewViewParams}, optional parameters are defined by {@link WebviewCompileOptions}
 *
 * @returns An anonymous class that can instantiate instances of {@link VueWebviewView}.
 */
export function compileVueWebviewView<Options extends WebviewCompileOptions>(
    params: WebviewViewParams & Options & { commands?: CompileContext<Options> }
): { new (context: ExtContext): VueWebviewView<Options> } {
    return class implements VueWebviewView<Options> {
        private _view: vscode.WebviewView | undefined
        private initialData?: PropsFromOptions<Options>
        public readonly emitters: Options['events']

        public get view() {
            return this._view
        }

        public get protocol(): OptionsToProtocol<Options> {
            throw new Error('Cannot access the webview protocol on the backend.')
        }

        constructor(private readonly context: ExtContext) {
            this.emitters = copyEmitters(params.events)
        }

        public start(...data: DataFromOptions<Options>): void {
            if (this._view) {
                throw new Error('VueWebviewView has already been started.')
            }

            if (semver.lt(vscode.version, MIN_WEBVIEW_VIEW_VERSION)) {
                const warnData = `${vscode.version} < ${MIN_WEBVIEW_VIEW_VERSION} (id: ${params.id})`
                getLogger().warn(`VS Code version is too low to support WebviewViews: ${warnData}`)
                return
            }

            vscode.window.registerWebviewViewProvider(params.id, {
                resolveWebviewView: async view => {
                    view.title = params.title ?? view.title
                    view.description = params.description ?? view.description
                    updateWebview(view.webview, { ...params, context: this.context })
                    this.initialData = (await params.start?.(...data)) ?? data

                    if (!this._view && params.commands) {
                        const init = async () => this.initialData
                        const modifiedWebview = Object.assign(view.webview, {
                            dispose: () => {}, // currently does nothing for `view` type webviews
                            context: this.context,
                            emitters: this.emitters,
                        })
                        Object.defineProperty(modifiedWebview, 'data', { get: () => this.initialData })
                        const server = registerWebviewServer(modifiedWebview, {
                            init,
                            ...params.commands,
                            ...this.emitters,
                        })
                        view.onDidDispose(() => server.dispose())
                    }

                    this._view = view
                    view.onDidDispose(() => (this._view = undefined))
                },
            })
        }

        public async clear(...data: DataFromOptions<Options>): Promise<boolean> {
            this.initialData = (await params.start?.(...data)) ?? data
            return this._view?.webview.postMessage({ command: '$clear' }) ?? false
        }
    } as any
}

/**
 * Creates a brand new webview panel, setting some basic initial parameters and updating the webview.
 */
function createWebviewPanel(params: WebviewPanelParams & { context: ExtContext }): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
        params.id,
        params.title,
        {
            viewColumn: isCloud9() ? vscode.ViewColumn.Two : params.viewColumn ?? vscode.ViewColumn.Beside,
        },
        { retainContextWhenHidden: isCloud9() || params.retainContextWhenHidden }
    )
    updateWebview(panel.webview, params)

    return panel
}

/**
 * Mutates a webview, applying various options and a static HTML page to bootstrap the Vue code.
 */
function updateWebview(webview: vscode.Webview, params: WebviewParams & { context: ExtContext }): vscode.Webview {
    const context = params.context.extensionContext
    const libsPath: string = path.join(context.extensionPath, 'media', 'libs')
    const jsPath: string = path.join(context.extensionPath, 'media', 'js')
    const cssPath: string = path.join(context.extensionPath, 'media', 'css')
    const webviewPath: string = path.join(context.extensionPath, 'dist')
    const resourcesPath: string = path.join(context.extensionPath, 'resources')

    webview.options = {
        enableScripts: true,
        enableCommandUris: true,
        localResourceRoots: [
            vscode.Uri.file(libsPath),
            vscode.Uri.file(jsPath),
            vscode.Uri.file(cssPath),
            vscode.Uri.file(webviewPath),
            vscode.Uri.file(resourcesPath),
        ],
    }

    const loadLibs = ExtensionUtilities.getFilesAsVsCodeResources(
        libsPath,
        ['vue.min.js', ...(params.libFiles ?? [])],
        webview
    ).concat(ExtensionUtilities.getFilesAsVsCodeResources(jsPath, ['loadVsCodeApi.js'], webview))

    const cssFiles = params.cssFiles ?? [isCloud9() ? 'base-cloud9.css' : 'base.css']
    const loadCss = ExtensionUtilities.getFilesAsVsCodeResources(cssPath, [...cssFiles], webview)

    let scripts: string = ''
    let stylesheets: string = ''

    loadLibs.forEach(element => {
        scripts = scripts.concat(`<script src="${element}"></script>\n\n`)
    })

    loadCss.forEach(element => {
        stylesheets = stylesheets.concat(`<link rel="stylesheet" href="${element}">\n\n`)
    })

    const mainScript = webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, params.webviewJs)))

    webview.html = resolveWebviewHtml({
        scripts,
        stylesheets,
        main: mainScript,
        webviewJs: params.webviewJs,
        cspSource: updateCspSource(webview.cspSource),
    })

    return webview
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

/**
 * Updates the CSP source for webviews with an allowed source for AWS endpoints when running in
 * Cloud9 environments. Possible this can be further scoped to specific C9 CDNs or removed entirely
 * if C9 injects this.
 */
export function updateCspSource(baseSource: string) {
    return isCloud9() ? `https://*.amazonaws.com ${baseSource}` : baseSource
}

/**
 * To preserve compatability with our min-version types we are declaring only portions of the latest API.
 *
 * Introduced in VS Code 1.50.0. Types sourced from:
 * https://github.com/DefinitelyTyped/DefinitelyTyped/blob/ccaaa6ab6a4168c8644fd3c391c8bff9e485734b/types/vscode/index.d.ts
 */
declare module 'vscode' {
    /**
     * A webview based view.
     */
    export interface WebviewView {
        /**
         * Identifies the type of the webview view, such as `'hexEditor.dataView'`.
         */
        readonly viewType: string

        /**
         * The underlying webview for the view.
         */
        readonly webview: Webview

        /**
         * View title displayed in the UI.
         *
         * The view title is initially taken from the extension `package.json` contribution.
         */
        title?: string

        /**
         * Human-readable string which is rendered less prominently in the title.
         */
        description?: string

        /**
         * Event fired when the view is disposed.
         *
         * Views are disposed when they are explicitly hidden by a user (this happens when a user
         * right clicks in a view and unchecks the webview view).
         *
         * Trying to use the view after it has been disposed throws an exception.
         */
        readonly onDidDispose: Event<void>

        /**
         * Tracks if the webview is currently visible.
         *
         * Views are visible when they are on the screen and expanded.
         */
        readonly visible: boolean

        /**
         * Event fired when the visibility of the view changes.
         *
         * Actions that trigger a visibility change:
         *
         * - The view is collapsed or expanded.
         * - The user switches to a different view group in the sidebar or panel.
         *
         * Note that hiding a view using the context menu instead disposes of the view and fires `onDidDispose`.
         */
        readonly onDidChangeVisibility: Event<void>

        /**
         * Reveal the view in the UI.
         *
         * If the view is collapsed, this will expand it.
         *
         * @param preserveFocus When `true` the view will not take focus.
         */
        show(preserveFocus?: boolean): void
    }

    /**
     * Additional information the webview view being resolved.
     *
     * @param T Type of the webview's state.
     */
    interface WebviewViewResolveContext<T = unknown> {
        /**
         * Persisted state from the webview content.
         *
         * To save resources, the editor normally deallocates webview documents (the iframe content) that are not visible.
         * For example, when the user collapse a view or switches to another top level activity in the sidebar, the
         * `WebviewView` itself is kept alive but the webview's underlying document is deallocated. It is recreated when
         * the view becomes visible again.
         *
         * You can prevent this behavior by setting `retainContextWhenHidden` in the `WebviewOptions`. However this
         * increases resource usage and should be avoided wherever possible. Instead, you can use persisted state to
         * save off a webview's state so that it can be quickly recreated as needed.
         *
         * To save off a persisted state, inside the webview call `acquireVsCodeApi().setState()` with
         * any json serializable object. To restore the state again, call `getState()`. For example:
         *
         * ```js
         * // Within the webview
         * const vscode = acquireVsCodeApi();
         *
         * // Get existing state
         * const oldState = vscode.getState() || { value: 0 };
         *
         * // Update state
         * setState({ value: oldState.value + 1 })
         * ```
         *
         * The editor ensures that the persisted state is saved correctly when a webview is hidden and across
         * editor restarts.
         */
        readonly state: T | undefined
    }

    export interface WebviewViewProvider {
        /**
         * Revolves a webview view.
         *
         * `resolveWebviewView` is called when a view first becomes visible. This may happen when the view is
         * first loaded or when the user hides and then shows a view again.
         *
         * @param webviewView Webview view to restore. The provider should take ownership of this view. The
         *    provider must set the webview's `.html` and hook up all webview events it is interested in.
         * @param context Additional metadata about the view being resolved.
         * @param token Cancellation token indicating that the view being provided is no longer needed.
         *
         * @return Optional thenable indicating that the view has been fully resolved.
         */
        resolveWebviewView(
            webviewView: WebviewView,
            context: WebviewViewResolveContext,
            token: CancellationToken
        ): Thenable<void> | void
    }

    export namespace window {
        /**
         * Register a new provider for webview views.
         *
         * @param viewId Unique id of the view. This should match the `id` from the
         *   `views` contribution in the package.json.
         * @param provider Provider for the webview views.
         *
         * @return Disposable that unregisters the provider.
         */
        export function registerWebviewViewProvider(
            viewId: string,
            provider: WebviewViewProvider,
            options?: {
                /**
                 * Content settings for the webview created for this view.
                 */
                readonly webviewOptions?: {
                    /**
                     * Controls if the webview element itself (iframe) is kept around even when the view
                     * is no longer visible.
                     *
                     * Normally the webview's html context is created when the view becomes visible
                     * and destroyed when it is hidden. Extensions that have complex state
                     * or UI can set the `retainContextWhenHidden` to make the editor keep the webview
                     * context around, even when the webview moves to a background tab. When a webview using
                     * `retainContextWhenHidden` becomes hidden, its scripts and other dynamic content are suspended.
                     * When the view becomes visible again, the context is automatically restored
                     * in the exact same state it was in originally. You cannot send messages to a
                     * hidden webview, even with `retainContextWhenHidden` enabled.
                     *
                     * `retainContextWhenHidden` has a high memory overhead and should only be used if
                     * your view's context cannot be quickly saved and restored.
                     */
                    readonly retainContextWhenHidden?: boolean
                }
            }
        ): Disposable
    }
}
