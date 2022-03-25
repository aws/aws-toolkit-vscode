/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SeverityLevel, ShownMessage, TestMessage } from './message'

type Window = typeof vscode.window

export interface TestWindow {
    onDidShowMessage: vscode.Event<ShownMessage>
    waitForMessage(expected: string | RegExp, timeout?: number): Promise<ShownMessage>
}

// TODO: it's better to just buffer event emitters until they have a listener
function fireNext<T>(emitter: vscode.EventEmitter<T>, data: T): void {
    setTimeout(() => emitter.fire(data))
}

/**
 * A test window proxies {@link vscode.window}, intercepting calls whilst
 * allowing for introspection and mocking as-needed.
 */
export function createTestWindow(): Window & TestWindow {
    // TODO: write mix-in Proxy factory function
    const onDidShowMessageEmitter = new vscode.EventEmitter<ShownMessage>()

    return new Proxy(vscode.window, {
        get: (target, prop, recv) => {
            if (prop === 'onDidShowMessage') {
                return onDidShowMessageEmitter.event
            }
            if (prop === 'waitForMessage') {
                return (expected: string | RegExp, timeout: number = 5000) => {
                    return new Promise<ShownMessage>((resolve, reject) => {
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
                return TestMessage.create(SeverityLevel.Information, message =>
                    fireNext(onDidShowMessageEmitter, message)
                )
            }
            if (prop === 'showWarningMessage') {
                return TestMessage.create(SeverityLevel.Warning, message => fireNext(onDidShowMessageEmitter, message))
            }
            if (prop === 'showErrorMessage') {
                return TestMessage.create(SeverityLevel.Error, message => fireNext(onDidShowMessageEmitter, message))
            }
            return Reflect.get(target, prop, recv)
        },
    }) as any
}
