/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { getLogger } from '../shared/logger'
import { Message } from './client'

interface Command<T extends any[] = any, R = any> {
    (...args: T): R | never
    (this: WebviewServer, ...args: T): R | never
}

export interface Protocol<U = any, S = any> {
    /**
     * Called when the frontend wants to submit the webview. If the result is valid, the webview is closed.
     */
    submit?: (result: S) => Promise<void> | void | never
    /**
     * Initial data to load. This is called only once, even if the view is refreshed.
     * Further calls return undefined.
     */
    init?: () => Promise<U | undefined>
    [key: string]: Command<any, any> | vscode.EventEmitter<any> | undefined
}

export interface Commands {
    [key: string]: Command<any, any> | undefined
}

export interface Events {
    [key: string]: vscode.EventEmitter<any>
}

export interface WebviewCompileOptions<
    C extends Commands = any,
    E extends Events = any,
    D extends any[] = any[],
    S = any,
    O = any,
    P = any
> {
    /**
     * Events emitters provided by the backend. Note that whatever is passed into this option is
     * only used for type and key generation. Do not assume the same reference will exist on instantiation.
     */
    events?: E
    /**
     * Commands provided by the backend. These are called with a `this` type with the following shape:
     * ```ts
     * interface {
     *    emitters: typeof events
     *    arguments: typeof validateData
     * }
     * ```
     * Merged with {@link WebviewServer}
     */
    commands?: C
    /**
     * Called when the webview is started.
     *
     * Whatever is returned by this function is then passed into the frontend code via {@link Protocol.init}.
     * Note that if this function is not provided or if it returns `undefined` then the arguments are passed directly
     * to the frontend code. This function and {@link WebviewCompileOptions.submit} can be thought of as 'glue' code
     * that exists as interfaces between the frontend/backend logic. The purpose is primarily to infer types, though
     * it can also be used for pre/post processing of the inputs/outputs of the webview.
     */
    start?(this: ThisType<WebviewServer>, ...args: D): Promise<P> | P
    /**
     * Called when the webview calls {@link Protocol.submit}.
     *
     * Whatever is returned by this function is then forwarded to the creator of the webview. If this function does not
     * exist, or if it returns `undefined`, then `result` is passed directly. A successful submission will close the
     * webview, disposing any related listeners or handlers. Submissions can be rejected by throwing an error.
     */
    submit?(this: ThisType<WebviewServer>, result: S): Promise<O> | O
}

export type CompileContext<T> = T extends WebviewCompileOptions<any, infer E>
    ? ThisType<WebviewServer & { emitters: E } & { data: ReturnType<NonNullable<T['start']>> }>
    : never
export type SubmitFromOptions<O> = O extends WebviewCompileOptions<any, any, any, infer S> ? S : never
export type DataFromOptions<O> = O extends WebviewCompileOptions<any, any, infer D> ? D : never
export type OutputFromOptions<O> = O extends WebviewCompileOptions<any, any, any, any, infer O> ? O : never
export type PropsFromOptions<O> = O extends WebviewCompileOptions<any, any, any, any, any, infer P> ? P : never
export type OptionsToProtocol<O> = O extends WebviewCompileOptions<infer C, infer E, any, infer S, any, infer P>
    ? {
          submit: (result: S) => Promise<void> | void | never
          init: () => Promise<P | undefined> | P | undefined
      } & C &
          E
    : never

export type WebviewServer = vscode.Webview & {
    context: ExtContext
    dispose(): void
}

/**
 * Sets up an event listener for the webview to call registered commands.
 *
 * @param webview Target webview to add the event hook.
 * @param commands Commands to register.
 */
export function registerWebviewServer(webview: WebviewServer, commands: Protocol): vscode.Disposable {
    const eventListeners: vscode.Disposable[] = []
    const disposeListeners = () => {
        while (eventListeners.length) {
            eventListeners.pop()?.dispose()
        }
    }

    const messageListener = webview.onDidReceiveMessage(async (event: Message) => {
        const { id, command, data } = event
        const metadata: Omit<Message, 'id' | 'command' | 'data'> = {}

        const handler = commands[command]

        if (!handler) {
            return getLogger().warn(`Received invalid message from client: ${command}`)
        }

        if (id === '0') {
            disposeListeners() // Webview reloaded, dispose all listeners
        }

        if (handler instanceof vscode.EventEmitter) {
            // TODO: make server dipose of event if client calls `dispose`
            eventListeners.push(handler.event(e => webview.postMessage({ command, event: true, data: e })))
            getLogger().verbose(`Registered event handler for: ${command}`)
            return webview.postMessage({ id, command, event: true })
        }

        // TODO: these commands could potentially have sensitive data, we don't want to log in that case
        getLogger().debug(`Webview called command "${command}" with args: %O`, data)

        let result: any
        try {
            result = await handler.call(webview, ...data)
            // For now undefined means we should not send any data back
            // Later on the commands should specify how undefined is handled
            if (result === undefined) {
                return
            }
        } catch (err) {
            if (!(err instanceof Error)) {
                getLogger().debug(`Webview server threw on comamnd "${command}" but it was not an error: `, err)
                return
            }
            result = JSON.stringify(err, Object.getOwnPropertyNames(err))
            delete result.stack // Not relevant to frontend code, we only care about the message
            metadata.error = true
            getLogger().debug(`Webview server failed on command "${command}": %s`, err.message)
        }

        // TODO: check if webview has been disposed of before posting message (not necessary but nice)
        // We also get a boolean value back, maybe retry sending on false?
        webview.postMessage({ id, command, data: result, ...metadata })
    })

    return { dispose: () => (messageListener.dispose(), disposeListeners()) }
}
