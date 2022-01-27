/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebviewPanel } from '../../../webviews/main'
import { instrumentPanel, TestWebviewPanel } from '../../webviews/panel'
import { SeverityLevel, ShownMessage, TestMessage } from './message'

type Window = typeof vscode.window

export interface TestWindowProps {
    onDidShowMessage: vscode.Event<ShownMessage>
    waitForMessage(expected: string | RegExp, timeout?: number): Promise<ShownMessage>
    /** Waits for a webview panel to be created, matched on title */
    waitForWebviewPanel<T extends VueWebviewPanel<any>>(
        expected: string | RegExp,
        timeout?: number
    ): Promise<TestWebviewPanel<T>>
}

/**
 * Merged view of {@link vscode.window} and fields provied by {@link TestWindowProps}
 */
export type TestWindow = Window & TestWindowProps

// TODO: it's better to just buffer event emitters until they have a listener
function fireNext<T>(emitter: vscode.EventEmitter<T>, data?: T): void {
    setTimeout(() => emitter.fire(data))
}

/**
 * A test window proxies {@link vscode.window}, intercepting calls whilst
 * allowing for introspection and mocking as-needed.
 */
export function createTestWindow(): TestWindow {
    // TODO: write mix-in Proxy factory function
    const onDidShowMessageEmitter = new vscode.EventEmitter<ShownMessage>()
    const onDidCreateWebviewPanelEmitter = new vscode.EventEmitter<vscode.WebviewPanel & { client: any }>()

    // We should always store a reference in case test code stubs the `vscode` module
    const window = vscode.window
    return new Proxy(window, {
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
            if (prop === 'waitForWebviewPanel') {
                return (expected: string | RegExp, timeout: number = 5000) => {
                    return new Promise<vscode.WebviewPanel & { client: any }>((resolve, reject) => {
                        const d = onDidCreateWebviewPanelEmitter.event(panel => {
                            if (panel.title.match(expected)) {
                                d.dispose()
                                resolve(panel)
                            }
                        })
                        setTimeout(() => {
                            d.dispose()
                            reject(new Error(`Timed out waiting for panel: ${expected}`))
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
            if (prop === 'createWebviewPanel') {
                return (...args: Parameters<Window['createWebviewPanel']>) => {
                    const panel = instrumentPanel(window.createWebviewPanel(...args))
                    onDidCreateWebviewPanelEmitter.fire(panel)

                    return panel
                }
            }
            return Reflect.get(target, prop, recv)
        },
    }) as any
}
