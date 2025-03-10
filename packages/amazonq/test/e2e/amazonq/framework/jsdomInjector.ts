/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSDOM, VirtualConsole } from 'jsdom'

/**
 * JSDOM is used to help hoist MynahUI to running in a node environment vs in the browser (which is what it's made for)
 */
export function injectJSDOM() {
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('error', (error) => {
        // JSDOM can't load scss from mynah UI, just skip it
        if (!error.includes('Could not parse CSS stylesheet')) {
            console.error(error)
        }
    })

    const dom = new JSDOM(undefined, {
        pretendToBeVisual: true,
        includeNodeLocations: true,
        virtualConsole,
    })
    global.window = dom.window as unknown as Window & typeof globalThis
    global.document = dom.window.document
    global.self = dom.window as unknown as Window & typeof globalThis
    global.Element = dom.window.Element
    global.HTMLElement = dom.window.HTMLElement
    global.Node = dom.window.Node

    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

    // jsdom doesn't have support for innerText: https://github.com/jsdom/jsdom/issues/1245 which mynah ui uses
    Object.defineProperty(global.Element.prototype, 'innerText', {
        get() {
            return this.textContent
        },
        set(value) {
            this.textContent = value
        },
    })

    // jsdom doesn't have support for structuredClone. See https://github.com/jsdom/jsdom/issues/3363
    global.structuredClone = (val: any) => JSON.parse(JSON.stringify(val))
}
