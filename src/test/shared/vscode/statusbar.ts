/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isKeyOf } from '../../../shared/utilities/tsUtils'

export type TestStatusBarItem = vscode.StatusBarItem & {
    readonly visible: boolean
    readonly disposed: boolean
    readonly onDidShow: vscode.Event<void>
    readonly onDidHide: vscode.Event<void>
}

export function createTestStatusBarItem(item: vscode.StatusBarItem): TestStatusBarItem {
    const state = { visible: false, disposed: false }
    const emitters = {
        onDidShow: new vscode.EventEmitter<void>(),
        onDidHide: new vscode.EventEmitter<void>(),
    }

    return new Proxy(item, {
        set: (target, prop, val) => Reflect.set(target, prop, val, target),
        get: (target, prop: keyof TestStatusBarItem, recv) => {
            if (isKeyOf(prop, state)) {
                return state[prop]
            }
            if (isKeyOf(prop, emitters)) {
                return emitters[prop].event
            }
            if (prop === 'show') {
                return function () {
                    const val = target.show()
                    if (!state.visible) {
                        state.visible = true
                        emitters.onDidShow.fire()
                    }
                    return val
                }
            }
            if (prop === 'hide') {
                return function () {
                    const val = target.hide()
                    if (state.visible) {
                        state.visible = false
                        emitters.onDidHide.fire()
                    }
                    return val
                }
            }
            if (prop === 'dispose') {
                return function () {
                    state.disposed = true
                    return vscode.Disposable.from(target, ...Object.values(emitters)).dispose()
                }
            }
            return Reflect.get(target, prop, recv)
        },
    }) as TestStatusBarItem
}

export class TestStatusBar implements Pick<typeof vscode.window, 'setStatusBarMessage' | 'createStatusBarItem'> {
    readonly #items: TestStatusBarItem[] = []

    public constructor(private readonly window: typeof vscode.window) {}

    public get items(): Readonly<TestStatusBarItem[]> {
        return [...this.#items]
    }

    /**
     * Returns the text of all _visible_ status bar items
     *
     * This is sorted in the order they would normally appear, i.e. left to right
     */
    public get messages(): string[] {
        return this.#items.filter(i => i.visible).map(i => i.text)
    }

    public setStatusBarMessage(text: string, hideWhen?: number | Thenable<any>): vscode.Disposable {
        const item = this.createStatusBarItem(vscode.StatusBarAlignment.Right)
        item.text = text
        item.show()

        if (typeof hideWhen === 'number') {
            setTimeout(() => item.dispose(), hideWhen)
        } else if (hideWhen !== undefined) {
            hideWhen.then(
                () => item.dispose(),
                () => item.dispose()
            )
        }

        return item
    }

    public createStatusBarItem(
        alignmentOrId?: vscode.StatusBarAlignment | string,
        priorityOrAlignment?: number | vscode.StatusBarAlignment,
        priorityArg?: number
    ): TestStatusBarItem {
        // let id: string | undefined
        let alignment: number | undefined
        let priority: number | undefined

        if (typeof alignmentOrId === 'string') {
            // id = alignmentOrId
            alignment = priorityOrAlignment
            priority = priorityArg
        } else {
            alignment = alignmentOrId
            priority = priorityOrAlignment
        }

        const item = createTestStatusBarItem(this.window.createStatusBarItem(alignment, priority))
        this.#items.push(item)
        this.#items.sort((a, b) => {
            if (a.alignment === b.alignment) {
                return (a.priority ?? 0) - (b.priority ?? 0)
            }

            return a.alignment === vscode.StatusBarAlignment.Left ? -1 : 1
        })

        return item
    }
}
