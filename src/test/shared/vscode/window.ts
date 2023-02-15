/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SeverityLevel, ShownMessage, TestMessage } from './message'

type Window = typeof vscode.window

export interface TestWindow {
    shownMessages: ShownMessage[]
    onDidShowMessage: vscode.Event<ShownMessage>
    waitForMessage(expected: string | RegExp, timeout?: number): Promise<ShownMessage>
}

/**
 * A test window proxies {@link vscode.window}, intercepting calls whilst
 * allowing for introspection and mocking as-needed.
 */
export function createTestWindow(): Window & TestWindow {
    // TODO: write mix-in Proxy factory function
    const onDidShowMessageEmitter = new vscode.EventEmitter<ShownMessage>()
    const shownMessages: ShownMessage[] = []

    function fireOnDidShowMessage(message: ShownMessage) {
        shownMessages.push(message)
        onDidShowMessageEmitter.fire(message)
    }

    return new Proxy(vscode.window, {
        get: (target, prop, recv) => {
            if (prop === 'shownMessages') {
                return shownMessages
            }
            if (prop === 'onDidShowMessage') {
                return onDidShowMessageEmitter.event
            }
            if (prop === 'waitForMessage') {
                return (expected: string | RegExp, timeout: number = 5000) => {
                    return new Promise<ShownMessage>((resolve, reject) => {
                        const alreadyShown = shownMessages.find(m => m.visible && m.message.match(expected))
                        if (alreadyShown) {
                            return resolve(alreadyShown)
                        }

                        const d = onDidShowMessageEmitter.event(shownMessage => {
                            if (shownMessage.message.match(expected)) {
                                d.dispose()
                                resolve(shownMessage)
                            }
                        })
                        setTimeout(() => {
                            d.dispose()
                            reject(new Error(`Timed out waiting for message: ${expected}`))
                        }, timeout)
                    })
                }
            }
            if (prop === 'showInformationMessage') {
                return TestMessage.create(SeverityLevel.Information, fireOnDidShowMessage)
            }
            if (prop === 'showWarningMessage') {
                return TestMessage.create(SeverityLevel.Warning, fireOnDidShowMessage)
            }
            if (prop === 'showErrorMessage') {
                return TestMessage.create(SeverityLevel.Error, fireOnDidShowMessage)
            }
            return Reflect.get(target, prop, recv)
        },
    }) as any
}
