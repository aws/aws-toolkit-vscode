/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewApi } from 'vscode-webview'
import { Commands } from './server'

declare const vscode: WebviewApi<any>

export interface Message<T = any, U extends string = string> {
    id: string
    data: T | Error
    command: U
    // TODO: implement
    memoize?: boolean
    once?: boolean
}

type ClientCommands<T> = {
    readonly [P in keyof T]: OmitThisParameter<T[P]> extends (...args: infer P) => infer R
        ? (...args: P) => R extends Promise<any> ? R : Promise<R>
        : never
}
// & {
//  submit(result: S): Promise<void | Error>
//}

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
function sendRequest<T extends any[], R, U extends string>(id: string, command: U, args: T): Promise<R> {
    const deproxied = JSON.parse(JSON.stringify(args))
    const response = new Promise<R>((resolve, reject) => {
        const listener = (event: { data: Message<R, U> }) => {
            const message = event.data

            if (id !== message.id) {
                return
            }

            window.removeEventListener('message', listener)

            if (message.data instanceof Error) {
                reject(message.data)
            } else {
                resolve(message.data)
            }
        }
        window.addEventListener('message', listener)

        setTimeout(() => {
            window.removeEventListener('message', listener)
            reject(new Error(`Timed out while waiting for response: id: ${id}, command: ${command}`))
        }, 300000)
    })

    vscode.postMessage({ id, command, data: deproxied } as Message<T, U>)
    return response
}

export type WebviewClient<T extends Commands<any>> = ClientCommands<T>
/**
 * Used to create a new 'WebviewClient' to communicate with the backend.
 *
 *
 */
export class WebviewClientFactory {
    /** Used to generate unique ids per request/message. */
    private static counter = 0

    /**
     * Creates a new client. These clients are defined by their types; they do not have any knowledge
     * of the backend protocol other than the specified type.
     */
    public static create<T extends Commands<any>>(): WebviewClient<T> {
        return new Proxy(
            {},
            {
                set: () => {
                    throw new TypeError('Cannot set property to webview client')
                },
                get: (_, prop) => {
                    if (typeof prop !== 'string') {
                        return // log this?
                    }
                    // TODO: implement memoize, once, etc.
                    if (prop === 'init') {
                        const state = vscode.getState() ?? {}
                        if (state['__once']) {
                            // TODO: just make fake promise and swallow callbacks, or return undefined and fix types
                            return () => Promise.reject()
                        }
                        vscode.setState(Object.assign(state, { __once: true }))
                    }

                    const id = (WebviewClientFactory.counter++).toString()
                    return (...args: any) => sendRequest(id, prop, args)
                },
            }
        ) as WebviewClient<T>
    }
}
