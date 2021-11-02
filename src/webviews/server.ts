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

interface CommandWithOptions<T extends any[], R> extends CommandOptions {
    command: ((...args: T) => R | never) | ((this: WebviewServer, ...args: T) => R | never)
}

/** Dummy class just in-case someone tries to do some weird things with the emitters. */
// export class WebviewEventEmitter<T> {}

export interface Protocol<U = any, S = any> {
    /**
     * Called when the frontend wants to submit the webview. If the result is valid, the webview is closed.
     */
    submit?: (result: S) => Promise<void> | void | never
    /**
     * Initial data to load. This is called only once, even if the view is refreshed.
     * Further calls result in a rejected Promise.
     */
    init?: () => Promise<U> | U
    [key: string]: Command<any, any> | CommandWithOptions<any, any> | vscode.EventEmitter<any> | undefined
}

export interface Commands {
    [key: string]: Command<any, any> | CommandWithOptions<any, any> | undefined
}

export interface Events {
    [key: string]: vscode.EventEmitter<any>
}

export interface WebviewCompileOptions<C extends Commands = any, E extends Events = any, D = any, S = any, O = any> {
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
    /** Validates the input from `show` is correct. Used to infer the type returned by `init`. */
    validateData?: (data?: D) => Promise<boolean> | boolean
    /** Validates the output from `submit` is correct. Used to infer the type returned by `show`. */
    validateSubmit?: (result: S) => Promise<O> | O
}

export type CompileContext<T> = T extends WebviewCompileOptions<any, infer E, infer D>
    ? ThisType<WebviewServer & { emitters: E } & { arguments: D }>
    : never
export type SubmitFromOptions<O> = O extends WebviewCompileOptions<any, any, any, infer S> ? S : never
export type DataFromOptions<O> = O extends WebviewCompileOptions<any, any, infer D> ? D : never
export type OutputFromOptions<O> = O extends WebviewCompileOptions<any, any, any, any, infer O> ? O : never

export type OptionsToProtocol<O> = O extends WebviewCompileOptions<infer C, infer E, infer D, infer S>
    ? {
          submit: (result: S) => Promise<void> | void | never
          init: () => Promise<D> | D
      } & C &
          E
    : never

export type WebviewServer = vscode.Webview & {
    context: ExtContext
    dispose(): void
}

interface CommandOptions {
    /** Function will only ever execute once, even when the view is refreshed. */
    once?: boolean
    /** Store the result on the client side via Webview API. */
    memoize?: boolean
}

// TODO:
// add readonly props on webview create rather than `init`

/**
 * Sets up an event listener for the webview to call registered commands.
 *
 * @param webview
 * @param commands
 */
export function registerWebviewServer(webview: WebviewServer, commands: Protocol) {
    webview.onDidReceiveMessage(async (event: Message) => {
        const { id, command, data } = event
        const metadata: Omit<Message, 'id' | 'command' | 'data'> = {}

        const handler = commands[command]

        if (!handler) {
            return getLogger().warn(`Received invalid message from client: ${command}`)
        }

        if (handler instanceof vscode.EventEmitter) {
            // TODO: make server dipose of event if client calls `dispose`
            handler.event(e => webview.postMessage({ command, event: true, data: e }))
            getLogger().verbose(`Registered event handler for: ${command}`)
            return webview.postMessage({ id, command, event: true })
        }

        let fn: Command
        if (typeof handler !== 'function') {
            fn = handler.command
            const partial = { ...handler } as Partial<typeof handler>
            delete partial.command
            Object.assign(metadata, partial)
        } else {
            fn = handler
        }

        // TODO: these commands could potentially have sensitive data, we don't want to log in that case
        getLogger().debug(`Webview called command "${command}" with args: %O`, data)

        let result: any
        try {
            result = await fn.call(webview, ...data)
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
            delete result.stack // Already being logged anyway
            metadata.error = true
            getLogger().error(`Webview server failed on command "${command}": %O`, err)
        }

        webview.postMessage({ id, command, data: result, ...metadata })
    })
}
