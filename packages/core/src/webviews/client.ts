/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { WebviewApi } from 'vscode-webview'
import { ClassToProtocol, VueWebview } from './main'
import { Protocol } from './server'

declare const vscode: WebviewApi<any>

interface MessageBase<U extends string = string> {
    id: string
    command: U
}

export interface Message<T = any, U extends string = string> extends MessageBase<U> {
    data: T | Error
    event?: false
    error?: boolean
}

interface EventMessage<T = any, U extends string = string> extends MessageBase<U> {
    event: true
    data: T
    command: U
}

/**
 * Message used for delivering errors. The `data` field is a stringified `Error`.
 * Currently only `Error` instances are rebuilt, though it is possible to extend this.
 */
interface ErrorMessage<U extends string = string> extends MessageBase<U> {
    error: true
    data: string
    command: U
}

type ClientCommands<T> = {
    readonly [P in keyof T]: T[P] extends EventEmitter<infer P>
        ? (listener: (e: P) => void) => Promise<{ dispose: () => void }>
        : OmitThisParameter<T[P]> extends (...args: infer P) => infer R
        ? (...args: P) => R extends Promise<any> ? R : Promise<R>
        : never
}

export type WebviewClient<T> = ClientCommands<T>
/**
 * Used to create a new 'WebviewClient' to communicate with the backend.
 */
export class WebviewClientFactory {
    /** Used to generate unique ids per request/message. */
    private static counter = 0
    /** Set to true the first time a client is created. */
    private static initialized = false
    /** All listeners (except the 'global' commands) registered to `message`. */
    private static messageListeners: Set<() => any> = new Set()

    /**
     * Sets up 'global' commands used internally for special functionality that is otherwise
     * not exposed to the frontend or backend code.
     */
    private static registerGlobalCommands() {
        const remountEvent = new Event('remount')

        window.addEventListener('message', (event: { data: Message }) => {
            const { command } = event.data
            if (command === '$clear') {
                vscode.setState({})
                this.messageListeners.forEach(listener => this.removeListener(listener))
                window.dispatchEvent(remountEvent)
            }
        })
    }

    /**
     * Adds a new listener to the `message` event.
     */
    private static addListener(listener: (...args: any) => void): void {
        this.messageListeners.add(listener)
        window.addEventListener('message', listener)
    }

    /**
     * Removes the listener from the backing store and unregisters it from the window.
     */
    private static removeListener(listener: (...args: any) => void): void {
        this.messageListeners.delete(listener)
        window.removeEventListener('message', listener)
    }

    /**
     * Sends a request to the backend server. This effectively wraps a 'message' event into a Promise.
     * Registered listeners are automatically disposed of after receiving the desired message. Arguments
     * are 'de-proxied' and parsed into plain objects.
     *
     * If no response has been received after 5 minutes, the Promise is rejected and listener removed.
     *
     * @param id Message ID. Should be unique to each individual request.
     * @param command Identifier associated with the backend command.
     * @param args Arguments to pass to the backend command.
     *
     * @returns The backend's response as a Promise.
     */
    private static sendRequest<T extends any[], R, U extends string>(
        id: string,
        command: U,
        args: T
    ): Promise<R | { dispose: () => void }> {
        const deproxied = JSON.parse(JSON.stringify(args))
        const response = new Promise<R | { dispose: () => void }>((resolve, reject) => {
            const listener = (event: { data: Message<R, U> | ErrorMessage<U> }) => {
                const message = event.data

                if (id !== message.id) {
                    return
                }

                this.removeListener(listener)
                window.clearTimeout(timeout)

                if (message.error === true) {
                    const revived = JSON.parse(message.data as string)
                    reject(new Error(revived.message))
                } else if (message.event) {
                    if (typeof args[0] !== 'function') {
                        reject(new Error(`Expected frontend event handler to be a function: ${command}`))
                    }
                    resolve(this.registerEventHandler(command, args[0]))
                } else {
                    resolve(message.data as R) // TODO: interfaces need a bit of refinement in terms of types
                }
            }

            const timeout = setTimeout(() => {
                this.removeListener(listener)
                reject(new Error(`Timed out while waiting for response: id: ${id}, command: ${command}`))
            }, 300000)

            this.addListener(listener)
        })

        vscode.postMessage({ id, command, data: deproxied } as Message<T, U>)
        return response
    }

    private static registerEventHandler<T extends (e: R) => void, R, U extends string>(
        command: U,
        args: T
    ): { dispose: () => void } {
        const listener = (event: { data: Message<R, U> | EventMessage<R, U> }) => {
            const message = event.data

            if (message.command !== command) {
                return
            }

            if (!message.event) {
                throw new Error(`Expected backend handler to be an event emitter: ${command}`)
            }

            args(message.data)
        }
        this.addListener(listener)

        return { dispose: () => this.removeListener(listener) }
    }

    /**
     * Creates a new client. These clients are defined by their types; they do not have any knowledge
     * of the backend protocol other than the specified type.
     */
    public static create<T extends VueWebview>(): WebviewClient<ClassToProtocol<T>>
    public static create<T extends ClientCommands<T>>(): WebviewClient<T>
    public static create<T extends Protocol>(): WebviewClient<T> {
        if (!this.initialized) {
            this.initialized = true
            this.registerGlobalCommands()
        }

        return new Proxy(
            {},
            {
                set: () => {
                    throw new TypeError('Cannot set property to webview client')
                },
                get: (_, prop) => {
                    if (typeof prop !== 'string') {
                        console.warn(`Tried to index webview client with non-string property: ${String(prop)}`)
                        return
                    }

                    if (prop === 'init') {
                        const state = vscode.getState() ?? {}
                        if (state['__once']) {
                            return () => Promise.resolve()
                        }
                        vscode.setState(Object.assign(state, { __once: true }))
                    }

                    const id = (this.counter++).toString()
                    return (...args: any) => this.sendRequest(id, prop, args)
                },
            }
        ) as WebviewClient<T>
    }
}
