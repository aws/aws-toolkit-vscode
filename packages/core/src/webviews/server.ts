/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../shared/logger'
import { Message } from './client'
import { AsyncResource } from 'async_hooks'

interface Command<T extends any[] = any, R = any> {
    (...args: T): R | never
}

export interface Protocol {
    [key: string]: Command | vscode.EventEmitter<any> | undefined
}

/**
 * Sets up an event listener for the webview to call registered commands.
 *
 * @param webview Target webview to add the event hook.
 * @param commands Commands to register.
 * @param webviewId A human readable string that will identify the webview
 */
export function registerWebviewServer(
    webview: vscode.Webview,
    commands: Protocol,
    webviewId: string
): vscode.Disposable {
    const eventListeners: vscode.Disposable[] = []
    const disposeListeners = () => {
        while (eventListeners.length) {
            eventListeners.pop()?.dispose()
        }
    }

    const messageListener = webview.onDidReceiveMessage(
        // XXX: In earlier versions of Node the first parameter was used as
        // the `thisArg` for calling the bound function.
        //
        // Fixed in https://github.com/nodejs/node/commit/324a6c235a5bfcbcd7cc7491d55461915c10af34
        AsyncResource.bind(async function (this: any, event: Message) {
            const { id, command, data } = event ?? (this as Message)
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
            } catch (err) {
                if (!(err instanceof Error)) {
                    getLogger().debug(`Webview server threw on command "${command}" but it was not an error: `, err)
                    return
                }
                result = JSON.stringify(err, Object.getOwnPropertyNames(err))
                delete result.stack // Not relevant to frontend code, we only care about the message
                metadata.error = true

                // A command failed in the backend/server, this will surface the error to the user as a vscode error message.
                // This is the base error handler that will end up catching all unhandled errors.
                handleWebviewError(err, webviewId, command)
            }

            // TODO: check if webview has been disposed of before posting message (not necessary but nice)
            // We also get a boolean value back, maybe retry sending on false?
            await webview.postMessage({ id, command, data: result, ...metadata })
        })
    )

    return { dispose: () => (messageListener.dispose(), disposeListeners()) }
}

let errorHandler: (error: unknown, webviewId: string, command: string) => void
/**
 * Registers the handler for errors thrown by the webview backend/server code.
 */
export function registerWebviewErrorHandler(handler: typeof errorHandler): void {
    if (errorHandler !== undefined) {
        throw new TypeError('Webview error handler has already been registered')
    }

    errorHandler = handler
}
/**
 * Invokes the registered webview error handler.
 */
export function handleWebviewError(error: unknown, webviewId: string, command: string): void {
    if (errorHandler === undefined) {
        throw new Error('Webview error handler not registered')
    }
    return errorHandler(error, webviewId, command)
}
