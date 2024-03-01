/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isCloud9 } from '../shared/extensionUtilities'
import { Protocol, registerWebviewServer } from './server'
import { getIdeProperties } from '../shared/extensionUtilities'
import { getFunctions } from '../shared/utilities/classUtils'

interface WebviewParams {
    /**
     * The entry-point into the webview.
     */
    webviewJs: string

    /**
     * Stylesheets to use in addition to "base.css".
     */
    cssFiles?: string[]

    /**
     * Additional JS files to loaded in.
     */
    libFiles?: string[]
}

interface WebviewPanelParams extends WebviewParams {
    /**
     * ID of the webview which should be globally unique per view.
     */
    id: string

    /**
     * Title of the webview panel. This is shown in the editor tab.
     */
    title: string

    /**
     * Preserves the webview when not focused by the user.
     *
     * This has a performance penalty and should be avoided.
     */
    retainContextWhenHidden?: boolean

    /**
     * View column to initally show the view in. Defaults to split view.
     */
    viewColumn?: vscode.ViewColumn
}

interface WebviewViewParams extends WebviewParams {
    /**
     * ID of the webview which must be the same as the one used in `package.json`.
     */
    id: string

    /**
     * Title of the view. Defaults to the title set in `package.json` is not provided.
     */
    title?: string

    /**
     * Optional 'description' text applied to the title.
     */
    description?: string
}

export interface VueWebviewPanel<T extends VueWebview = VueWebview> {
    setup(webview: vscode.Webview): Promise<void>
    /**
     * Shows the webview with the given parameters.
     *
     * @returns A Promise that is resolved once the view is closed.
     */
    show(params: Omit<WebviewPanelParams, 'id' | 'webviewJs'>): Promise<vscode.WebviewPanel>

    /**
     * Forces a reload of the Vue runtime, resetting saved state without reloading the whole webview.
     */
    clear(): Promise<boolean>

    /**
     * The backend {@link VueWebview proxy} connected to this instance
     */
    readonly server: T
}

export interface VueWebviewView<T extends VueWebview = VueWebview> {
    /**
     * Registers the webview with VS Code.
     *
     * The view will not be rendered untl this is called.
     */
    register(params?: Partial<Omit<WebviewViewParams, 'id' | 'webviewJs'>>): vscode.Disposable

    /**
     * Event fired whenever the associated view is resolved.
     *
     * This can happen when the view first becomes visisble or when it is hidden and revealed again.
     */
    readonly onDidResolveView: vscode.Event<vscode.WebviewView>

    /**
     * The backend {@link VueWebview proxy} connected to this instance
     */
    readonly server: T
}

/**
 * Base class used to define client/server bindings for webviews.
 *
 * Sub-classes can be used to create new classes with fully-resolved bindings:
 * ```ts
 * class MyVueWebview extends VueWebview {
 *     public readonly id = 'foo'
 *     public readonly source = 'foo.js'
 *
 *     public constructor(private readonly myData: string) {
 *         super()
 *     }
 *
 *     public getMyData() {
 *         return this.myData
 *     }
 * }
 *
 * const Panel = VueWebview.compilePanel(MyVueWebview)
 * const view = new Panel(context, 'data')
 * view.show({ title: 'Foo' })
 * ```
 *
 * The unbound class type should then be used on the frontend:
 * ```ts
 * const client = WebviewClientFactory.create<MyVueWebview>()
 *
 * defineComponent({
 *   async created() {
 *       const data = await client.getMyData()
 *       console.log(data)
 *   },
 * })
 * ```
 *
 */
export abstract class VueWebview {
    /**
     * A unique identifier to associate with the webview.
     *
     * This must be the same as the `id` in `package.json` when using a WebviewView.
     */
    public abstract readonly id: string

    /**
     * The relative location, from the repository root, to the frontend entrypoint.
     */
    public abstract readonly source: string

    private readonly protocol: Protocol
    private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>()
    private readonly onDidDispose = this.onDidDisposeEmitter.event

    private disposed = false
    private context?: vscode.ExtensionContext

    public constructor() {
        const commands: Record<string, (...args: any[]) => unknown> = {}
        const ctor = this.constructor as new (...args: any[]) => any

        for (const [k, v] of Object.entries(getFunctions(ctor))) {
            commands[k] = v.bind(this)
        }

        this.protocol = commands
    }

    public get isDisposed() {
        return this.disposed
    }

    public getCompanyName(): string {
        return getIdeProperties().company
    }

    protected dispose(): void {
        this.disposed = true
        this.onDidDisposeEmitter.fire()
    }

    protected getContext(): vscode.ExtensionContext {
        if (!this.context) {
            throw new Error('Webview was not initialized with "ExtContext"')
        }

        return this.context
    }

    public static compilePanel<T extends new (...args: any[]) => VueWebview>(
        target: T
    ): new (context: vscode.ExtensionContext, ...args: ConstructorParameters<T>) => VueWebviewPanel<InstanceType<T>> {
        return class Panel {
            private readonly instance: InstanceType<T>
            private panel?: vscode.WebviewPanel

            public constructor(protected readonly context: vscode.ExtensionContext, ...args: ConstructorParameters<T>) {
                this.instance = new target(...args) as InstanceType<T>

                for (const [prop, val] of Object.entries(this.instance)) {
                    if (val instanceof vscode.EventEmitter) {
                        Object.assign(this.instance.protocol, { [prop]: val })
                    }
                }
            }

            public get server() {
                return this.instance
            }

            public async setup(webview: vscode.Webview) {
                const server = registerWebviewServer(webview, this.instance.protocol, this.instance.id)
                this.instance.onDidDispose(() => {
                    server.dispose()
                })
            }

            public async show(params: Omit<WebviewPanelParams, 'id' | 'webviewJs'>): Promise<vscode.WebviewPanel> {
                if (this.panel) {
                    this.panel.reveal(params.viewColumn, false)
                    return this.panel
                }

                const panel = createWebviewPanel(this.context, {
                    id: this.instance.id,
                    webviewJs: this.instance.source,
                    ...params,
                })
                const server = registerWebviewServer(panel.webview, this.instance.protocol, this.instance.id)
                this.instance.onDidDispose(() => {
                    server.dispose()
                    this.panel?.dispose()
                    this.panel = undefined
                })

                return (this.panel = panel)
            }

            public async clear(): Promise<boolean> {
                return this.panel?.webview.postMessage({ command: '$clear' }) ?? false
            }
        }
    }

    public static compileView<T extends new (...args: any[]) => VueWebview>(
        target: T
    ): new (context: vscode.ExtensionContext, ...args: ConstructorParameters<T>) => VueWebviewView<InstanceType<T>> {
        return class View {
            private readonly onDidResolveViewEmitter = new vscode.EventEmitter<vscode.WebviewView>()
            private readonly instance: InstanceType<T>
            private resolvedView?: vscode.WebviewView

            public readonly onDidResolveView = this.onDidResolveViewEmitter.event

            public constructor(protected readonly context: vscode.ExtensionContext, ...args: ConstructorParameters<T>) {
                this.instance = new target(...args) as InstanceType<T>

                for (const [prop, val] of Object.entries(this.instance)) {
                    if (val instanceof vscode.EventEmitter) {
                        Object.assign(this.instance.protocol, { [prop]: val })
                    }
                }

                this.instance.context = this.context
            }

            public get server() {
                return this.instance
            }

            public register(params: Omit<WebviewViewParams, 'id' | 'webviewJs'>): vscode.Disposable {
                return vscode.window.registerWebviewViewProvider(this.instance.id, {
                    resolveWebviewView: async view => {
                        view.title = params.title ?? view.title
                        view.description = params.description ?? view.description
                        updateWebview(this.context, view.webview, {
                            ...params,
                            webviewJs: this.instance.source,
                        })

                        if (!this.resolvedView) {
                            this.resolvedView = view

                            const server = registerWebviewServer(
                                this.resolvedView.webview,
                                this.instance.protocol,
                                this.instance.id
                            )
                            this.resolvedView.onDidDispose(() => {
                                server.dispose()
                                this.resolvedView = undefined
                            })
                        }

                        this.onDidResolveViewEmitter.fire(view)
                    },
                })
            }
        }
    }
}

type FilteredKeys<T> = { [P in keyof T]: unknown extends T[P] ? never : P }[keyof T]
type FilterUnknown<T> = Pick<T, FilteredKeys<T>>
type Commands<T extends VueWebview> = {
    [P in keyof T]: T[P] extends (...args: any[]) => any ? T[P] : unknown
}
type Events<T extends VueWebview> = {
    [P in keyof T]: T[P] extends vscode.EventEmitter<any> ? T[P] : unknown
}
export type ClassToProtocol<T extends VueWebview> = FilterUnknown<Commands<T> & Events<T>>

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

/**
 * Creates a brand new webview panel, setting some basic initial parameters and updating the webview.
 */
function createWebviewPanel(ctx: vscode.ExtensionContext, params: WebviewPanelParams): vscode.WebviewPanel {
    // C9 doesn't support 'Beside'. The next best thing is always using the second column.
    const viewColumn =
        isCloud9() && params.viewColumn === vscode.ViewColumn.Beside
            ? vscode.ViewColumn.Two
            : params.viewColumn ?? vscode.ViewColumn.Active

    const panel = vscode.window.createWebviewPanel(
        params.id,
        params.title,
        { viewColumn },
        {
            // The redundancy here is to correct a bug with Cloud9's Webview implementation
            // We need to assign certain things on instantiation, otherwise they'll never be applied to the view
            enableScripts: true,
            enableCommandUris: true,
            retainContextWhenHidden: isCloud9() || params.retainContextWhenHidden,
        }
    )
    updateWebview(ctx, panel.webview, params)

    return panel
}

function resolveRelative(webview: vscode.Webview, rootUri: vscode.Uri, files: string[]): vscode.Uri[] {
    return files.map(f => webview.asWebviewUri(vscode.Uri.joinPath(rootUri, f)))
}

/**
 * Mutates a webview, applying various options and a static HTML page to bootstrap the Vue code.
 */
function updateWebview(ctx: vscode.ExtensionContext, webview: vscode.Webview, params: WebviewParams): vscode.Webview {
    const dist = vscode.Uri.joinPath(ctx.extensionUri, 'dist')
    const resources = vscode.Uri.joinPath(ctx.extensionUri, 'resources')

    webview.options = {
        enableScripts: true,
        enableCommandUris: true,
        localResourceRoots: [dist, resources],
    }

    const libs = resolveRelative(webview, vscode.Uri.joinPath(dist, 'libs'), [
        'vscode.js',
        'vue.min.js',
        ...(params.libFiles ?? []),
    ])

    const css = resolveRelative(webview, vscode.Uri.joinPath(resources, 'css'), [
        isCloud9() ? 'base-cloud9.css' : 'base.css',
        ...(params.cssFiles ?? []),
    ])

    const mainScript = webview.asWebviewUri(vscode.Uri.joinPath(dist, params.webviewJs))

    webview.html = resolveWebviewHtml({
        scripts: libs.map(p => `<script src="${p}"></script>`).join('\n'),
        stylesheets: css.map(p => `<link rel="stylesheet" href="${p}">\n`).join('\n'),
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
    const resolvedParams = { ...params, connectSource: `'none'` }
    const localServer = process.env.WEBPACK_DEVELOPER_SERVER

    if (localServer) {
        const local = vscode.Uri.parse(localServer)
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
                img-src ${resolvedParams.cspSource} https: data:;
                script-src ${resolvedParams.cspSource};
                style-src ${resolvedParams.cspSource} 'unsafe-inline';
                font-src ${resolvedParams.cspSource} 'self' data:;"
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
