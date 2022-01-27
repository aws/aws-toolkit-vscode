/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EventEmitter } from 'vscode'
import { EventEmitter as WindowEventEmitter } from 'events'
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
    type Window = ConstructorParameters<typeof WebviewClientAgent>[0]

    const windowEmitter = new WindowEventEmitter()

    const window: Window = {
        addEventListener: (...args: Parameters<typeof window['addEventListener']>) => {
            if (typeof args[1] === 'object') {
                throw new Error('Object event listeners are not supported')
            }
            windowEmitter.addListener(args[0], args[1])
        },
        removeEventListener: (...args: Parameters<typeof window['removeEventListener']>) => {
            if (typeof args[1] === 'object') {
                throw new Error('Object event listeners are not supported')
            }
            windowEmitter.removeListener(args[0], args[1])
        },
        dispatchEvent: () => {
            throw new Error('Firing events is not supported.')
        },
        clearTimeout: clearTimeout,
    }

    const agent = new WebviewClientAgent(window, {
        // Testing state is not needed right now
        getState: () => {},
        setState: state => state,
        postMessage: message => emitter.fire(message),
    })

    // TODO: add clean-up logic
    receiver(e => windowEmitter.emit('message', { data: e }))

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
