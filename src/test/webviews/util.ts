/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EventEmitter } from 'vscode'
import { WebviewClient, WebviewClientAgent } from '../../webviews/client'
import { VueWebview } from '../../webviews/main'

/**
 * Creates a minimalistic implementation of a {@link WebviewClient} suitable for testing backend logic.
 *
 * This re-uses {@link WebviewClientAgent}.
 */
export function createTestClient<T extends VueWebview<any>>(
    receiver: EventEmitter<any>['event'],
    emitter: EventEmitter<any>
): WebviewClient<T['protocol']> {
    type Listener = Parameters<typeof window['addEventListener']>[1]
    type Window = ConstructorParameters<typeof WebviewClientAgent>[0]

    const listeners: Record<string, Listener[]> = {}

    const dispatch = (event: Event) => {
        for (const listener of listeners[event.type] ?? []) {
            if (typeof listener === 'function') {
                listener(event)
            } else {
                listener.handleEvent(event)
            }
        }

        return true // Not technically true to spec but good enough
    }

    const window: Window = {
        addEventListener: (...args: Parameters<typeof window['addEventListener']>) => {
            const [type, listener] = args
            ;(listeners[type] ??= []).push(listener)
        },
        removeEventListener: (...args: Parameters<typeof window['removeEventListener']>) => {
            const [type, listener] = args
            const arr = listeners[type] ?? []
            const ind = arr.indexOf(listener)

            if (ind !== -1) {
                arr.splice(ind, 1)
            }
        },
        dispatchEvent: dispatch,
        clearTimeout: clearTimeout,
    }

    const agent = new WebviewClientAgent(window, {
        // Testing state is not needed right now
        getState: () => {},
        setState: state => state,
        postMessage: message => emitter.fire(message),
    })

    // TODO: add clean-up logic
    receiver(e => dispatch(new MessageEvent('message', { data: e })))

    let counter = 0
    return new Proxy<WebviewClient<T['protocol']>>({} as any, {
        set: () => {
            throw new TypeError('Cannot set property to webview client')
        },
        get: (_, prop) => {
            // Why can't Typescript do CFA with asserts using `typeof` ???
            if (typeof prop !== 'string') {
                assert.fail(`Client property must be a string, got symbol: ${String(prop)}`)
            }
            const id = String(counter++)

            // hard-coded timeout time of 5 seconds for testing
            return (...args: any) => agent.sendRequest(id, prop, args, 5000)
        },
        getPrototypeOf() {
            return Object
        },
    })
}
