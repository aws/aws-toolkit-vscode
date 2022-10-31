/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'

// this is roughly how VS Code models things internally
export enum SeverityLevel {
    Information,
    Warning,
    Error,
}

interface MessageOptions<T extends vscode.MessageItem> extends vscode.MessageOptions {
    readonly severity?: SeverityLevel
    readonly items?: T[]
}

type Window = typeof vscode.window
type ShowMessage = Window['showInformationMessage'] | Window['showWarningMessage'] | Window['showErrorMessage']
export type ShownMessage = Omit<TestMessage, 'show'> & { items: ReturnType<TestMessage['show']> }

/**
 * In-memory model of vscode's message/notification UI element
 */
export class TestMessage<T extends vscode.MessageItem = vscode.MessageItem> {
    public readonly modal: boolean
    public readonly severity: SeverityLevel
    public readonly onDidSelectItem: vscode.Event<T | undefined>
    private _showing: boolean = false
    private _disposed: boolean = false
    private _selected: T | undefined
    private _onDidSelectItem = new vscode.EventEmitter<T | undefined>()

    public constructor(public readonly message: string, private readonly options?: MessageOptions<T>) {
        this.modal = !!options?.modal
        this.severity = options?.severity ?? SeverityLevel.Information
        this.onDidSelectItem = this._onDidSelectItem.event
    }

    public get visible() {
        return this._showing
    }

    public assertMessage(expected: string): void {
        assert.strictEqual(this.message, expected)
    }

    public assertSeverity(expected: SeverityLevel): void {
        assert.strictEqual(this.severity, expected)
    }

    public assertSelected(expected: T): void {
        assert.deepStrictEqual(this._selected, expected)
    }

    public assertShowing(): void {
        assert.ok(this._showing)
    }

    public assertNotShowing(): void {
        assert.ok(!this._showing)
    }

    public dispose(): void {
        this._disposed = true
        this._showing = false
    }

    public close(): void {
        const selected = this.options?.items?.find(item => item.isCloseAffordance)

        if (selected) {
            this.selectItem(selected)
        } else {
            this.dispose()
            this._onDidSelectItem.fire(undefined)
        }
    }

    public selectItem(item: string | RegExp | T): void {
        if (this._disposed) {
            throw new Error('Attempted to select from a disposed message')
        }

        const selected =
            typeof item === 'string' || item instanceof RegExp
                ? this.options?.items?.find(i => i.title.match(item))
                : this.options?.items?.find(i => i === item)

        if (!selected) {
            throw new Error(`Could not find the specified item: ${item}`)
        }

        this.dispose()
        this._selected = selected
        this._onDidSelectItem.fire(this._selected)
    }

    public show(): (T & { select(): void })[] {
        this._showing = true

        return (this.options?.items ?? []).map(item => {
            return {
                ...item,
                select: () => this.selectItem(item),
            }
        })
    }

    public static isMessageItem(obj: any): obj is vscode.MessageItem {
        return typeof obj?.title === 'string'
    }

    /**
     * Creates a new function to show a test message based off severity.
     *
     * Optionally takes a callback to notifiy when the message is shown.
     *
     * @param severity
     * @param callback
     */
    public static create(severity: SeverityLevel, callback?: (message: ShownMessage) => void): ShowMessage {
        return async <T extends vscode.MessageItem>(
            message: string,
            ...rest: [string | T | vscode.MessageOptions, ...(string | T)[]]
        ) => {
            const firstRest = rest[0]
            const stringMode = typeof firstRest === 'string'
            const opt = !stringMode && !TestMessage.isMessageItem(firstRest) ? firstRest : {}
            const items = (stringMode ? rest : rest.slice(1)) as (string | T)[]
            const mappedItems = items.map(i => (typeof i === 'string' ? { title: i } : i))
            const testMessage = new TestMessage(message, {
                severity,
                modal: opt.modal,
                items: mappedItems,
            })

            return new Promise<vscode.MessageItem | T | string | undefined>(resolve => {
                const d = testMessage.onDidSelectItem(i => (resolve(stringMode ? i?.title : i), d.dispose()))
                const shownItems = testMessage.show()
                callback?.(Object.assign(testMessage, { items: shownItems }))
            })
        }
    }
}
