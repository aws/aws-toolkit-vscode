/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { getLogger } from '../shared/logger'
import { Message } from './client'

interface Command<T extends any[], R> {
    (this: WebviewServer, ...args: T): R | never
}

interface CommandWithOptions<T extends any[], R> extends CommandOptions {
    command(this: WebviewServer, ...args: T): R | never
}

// TODO: rename to `Protocol` and incorporate events
export interface Commands<U = any, S = any> {
    /**
     * Called when the frontend wants to submit the webview. If the result is valid, the webview is closed.
     */
    submit?: (result: S) => Promise<void> | void | never
    /**
     * Initial data to load. This is called only once, even if the view is refreshed.
     * Further calls result in a rejected Promise.
     */
    init?: () => Promise<U> | U
    [key: string]: Command<any, any> | vscode.EventEmitter<any> | undefined //CommandWithOptions<any, any> | undefined
}

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

type CreateCommandsOptions<T extends Commands<any>> = {
    [P in keyof T]+?: CommandOptions
}

/**
 * Creates commands for the webview server + client.
 *
 * Currently just pass-through to extract the correct type and apply a `this` context to methods.
 *
 * @param commands
 * @param options
 * @returns
 */
export function createCommands<T extends Commands<U, S>, U = any, S = any>(
    commands: T & ThisType<WebviewServer>,
    options: CreateCommandsOptions<T> = {}
): OmitThisParameter<T> & { submit: (result: S) => Promise<void> } & { init: () => Promise<U> } {
    return commands as any
}

// TODO: finish this
export function compileCommands<T extends Commands<U, S>, U extends any[] = any, S = any>(
    commands: T & ThisType<WebviewServer>,
    options: CreateCommandsOptions<T> = {}
): CompiledCommands<T, U, S> {
    const compiled: Record<string, CommandWithOptions<U, S>> = {}
    Object.keys(commands).forEach(k => {
        const command = commands[k]
        if (command === undefined) {
            return
        }
        //const result = typeof command === 'function' ? { command } : command
        //compiled[k] = { memoize: false, once: false, ...result }
    })
    return {
        // TODO: throw an error is someone tries to access this
        client: {} as any,
        server: compiled,
    }
}

interface CompiledCommands<T extends Commands<U, S>, U extends any[] = any, S = any> {
    client: OmitThisParameter<T> & { submit: (result: S) => Promise<void> } & { init: () => Promise<U> }
    server: { [key: string]: CommandWithOptions<any, any> | undefined }
}

/**
 * Sets up an event listener for the webview to call registered commands.
 *
 * @param webview
 * @param commands
 */
export function registerWebviewServer<S>(webview: WebviewServer, commands: Commands<S>) {
    webview.onDidReceiveMessage(async (event: Message) => {
        const { id, command, data } = event

        const fn = commands[command]

        if (!fn) {
            return getLogger().warn(`Received invalid message from client: ${command}`)
        }

        if (fn instanceof vscode.EventEmitter) {
            // TODO: make server dipose of event if client calls `dispose`
            fn.event(e => webview.postMessage({ command, event: true, data: e }))
            getLogger().verbose(`Registered event handler for: ${command}`)
            return webview.postMessage({ id, command, event: true })
        }

        // TODO: these commands could potentially have sensitive data, we don't want to log in that case
        getLogger().debug(`Webview called command "${command}" with args: %O`, data)

        let result: any
        try {
            result = await fn.call(webview, ...data)
        } catch (err) {
            result = err
            getLogger().error(`Server failed on command "${command}": %O`, err)
        }

        webview.postMessage({ id, command, data: result })
    })
}
