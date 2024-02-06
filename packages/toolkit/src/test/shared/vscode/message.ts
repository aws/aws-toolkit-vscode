/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'

// This is roughly how VS Code models things internally
export enum SeverityLevel {
    Information = 'Information',
    Warning = 'Warning',
    Error = 'Error',

    // Special-case for progress notifications
    Progress = 'Progress',
}

interface MessageOptions<T extends vscode.MessageItem> extends vscode.MessageOptions {
    readonly severity?: SeverityLevel
    readonly items?: T[]
    readonly detail?: string
}

type Window = typeof vscode.window
type ProgressReport = { message?: string; increment?: number }
type ShowMessage = Window['showInformationMessage'] | Window['showWarningMessage'] | Window['showErrorMessage']
export type ShownMessage = Omit<TestMessage, 'show'> & { items: ReturnType<TestMessage['show']> }

/**
 * In-memory model of vscode's message/notification UI element
 */
export class TestMessage<T extends vscode.MessageItem = vscode.MessageItem> {
    private _message: string
    private _progress = 0
    private _showing = false
    private _disposed = false
    private _selected: T | undefined
    private _progressMessage: string | undefined
    private readonly _onDidSelectItem = new vscode.EventEmitter<T | undefined>()
    private readonly _onDidUpdateProgress = new vscode.EventEmitter<ProgressReport>()
    private readonly _progressReports: ProgressReport[] = []
    public readonly modal: boolean
    public readonly severity: SeverityLevel
    public readonly onDidSelectItem = this._onDidSelectItem.event
    public readonly onDidUpdateProgress = this._onDidUpdateProgress.event

    public constructor(message: string, private readonly options?: MessageOptions<T>) {
        this._message = message
        this.modal = !!options?.modal
        this.severity = options?.severity ?? SeverityLevel.Information
    }

    public get message() {
        const prefix = this._message ? `${this._message}: ` : ''

        return this._progressMessage ? `${prefix}${this._progressMessage}` : this._message
    }

    public get visible() {
        return this._showing && !!this.message
    }

    public get detail() {
        return this.options?.detail
    }

    public get totalProgress() {
        return this._progress
    }

    public get progressReports(): Readonly<ProgressReport[]> {
        return this._progressReports
    }

    public get cancellable() {
        return !!this.options?.items?.find(i => i.title === 'Cancel')
    }

    public assertMessage(expected: string | RegExp): void {
        this.compare(expected)
    }

    public assertSeverity(expected: SeverityLevel): void {
        assert.strictEqual(this.severity, expected)
    }

    public assertSelected(expected: T): void {
        assert.deepStrictEqual(this._selected, expected)
    }

    /**
     * Checks that the message matches the expected value and is an "Information" message
     */
    public assertInfo(expected: string | RegExp) {
        this.compare(expected, SeverityLevel.Information)
    }

    /**
     * Checks that the message matches the expected value and is a "Warning" message
     */
    public assertWarn(expected: string | RegExp) {
        this.compare(expected, SeverityLevel.Warning)
    }

    /**
     * Checks that the message matches the expected value and is an "Error" message
     */
    public assertError(expected: string | RegExp) {
        this.compare(expected, SeverityLevel.Error)
    }

    /**
     * Checks that the message matches the expected value and is a "Progress" message
     *
     * Use {@link totalProgress} and {@link progressReports} to check for more granular
     * details related to progress notifications.
     */
    public assertProgress(expected: string | RegExp) {
        this.compare(expected, SeverityLevel.Progress)
    }

    private compare(expected: string | RegExp, severity = this.severity) {
        if (this.severity !== severity) {
            throw new assert.AssertionError({
                message: 'Expected severity to match',
                actual: this.printDebug(),
                expected: this.printDebug(expected, severity),
            })
        }
        if (typeof expected === 'string') {
            assert.strictEqual(this.message, expected)
        } else if (!expected.test(this.message)) {
            throw new assert.AssertionError({
                message: 'Message did not match pattern',
                actual: this.message,
                expected: expected.source,
            })
        }
    }

    public printDebug(message: string | RegExp = this.message, severity = this.severity) {
        return [
            `severity: ${severity}`,
            `message: ${message}`,
            `items: ${this.options?.items?.map(i => i.title).join(', ') || '[no items]'}`,
        ].join(', ')
    }

    public dispose(): void {
        this._disposed = true
        this._showing = false
        this._onDidSelectItem.fire(this._selected)
        this._onDidSelectItem.dispose()
        this._onDidUpdateProgress.dispose()
    }

    public close(): void {
        const selected = this.options?.items?.find(item => item.isCloseAffordance)

        if (selected) {
            this.selectItem(selected)
        } else {
            this.dispose()
        }
    }

    public selectItem(item: string | RegExp | T): void {
        if (this._disposed) {
            throw new Error('Attempted to select from a disposed message')
        }
        if (!this.options?.items || this.options.items.length === 0) {
            throw new Error(`Could not find the specified item "${item}". Message has no items: ${this.message}`)
        }

        const selected =
            typeof item === 'string' || item instanceof RegExp
                ? this.options?.items?.find(i => i.title.match(item))
                : this.options?.items?.find(i => i === item)

        if (!selected) {
            throw new Error(`Could not find the specified item "${item}" on message: ${this.printDebug()}`)
        }

        this._selected = selected
        this.dispose()
    }

    public updateProgress(value: { message?: string; increment?: number }) {
        this._progress += value.increment ?? 0
        this._progressMessage = value.message ?? this._progressMessage
        this._progressReports.push(value)
        this._onDidUpdateProgress.fire(value)
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
    public static createShowMessageFn(
        severity: SeverityLevel,
        callback?: (message: ShownMessage) => void
    ): ShowMessage {
        return async <T extends vscode.MessageItem>(
            message: string,
            ...rest: [string | T | vscode.MessageOptions, ...(string | T)[]]
        ) => {
            const firstRest = rest[0]
            const stringMode = typeof firstRest === 'string' || typeof rest[1] === 'string'
            const opt = typeof firstRest !== 'string' && !TestMessage.isMessageItem(firstRest) ? firstRest : undefined
            const items = (opt === undefined ? rest : rest.slice(1)) as (string | T)[]
            const mappedItems = items.map(i => (typeof i === 'string' ? { title: i } : i))
            const testMessage = new TestMessage(message, {
                severity,
                modal: opt?.modal,
                items: mappedItems,
                ...opt,
            })

            return new Promise<vscode.MessageItem | T | string | undefined>(resolve => {
                testMessage.onDidSelectItem(i => resolve(stringMode ? i?.title : i))
                const shownItems = testMessage.show()
                callback?.(Object.assign(testMessage, { items: shownItems }))
            })
        }
    }
}

interface OpenDialogOptions extends vscode.OpenDialogOptions {
    readonly type: 'Open'
}

interface SaveDialogOptions extends vscode.SaveDialogOptions {
    readonly type: 'Save'
}

type FileSystemDialogOptions = OpenDialogOptions | SaveDialogOptions

interface FileSystemDialogItem {
    readonly uri: vscode.Uri
    readonly title: string
    readonly type: Exclude<vscode.FileType, vscode.FileType.SymbolicLink | vscode.FileType.Unknown>
}

/**
 * Test fixture for both opening files and saving files
 *
 * Using {@link vscode.workspace.fs} is not implemented. Tests can provide arbitrary URIs as user responses.
 */
export class TestFileSystemDialog {
    private _showing = false
    private _disposed = false
    private _selected: vscode.Uri | vscode.Uri[] | undefined
    private _onDidAcceptItem = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>()
    public readonly onDidAcceptItem = this._onDidAcceptItem.event

    public constructor(
        private readonly items: FileSystemDialogItem[],
        public readonly options: FileSystemDialogOptions
    ) {
        this._selected = options?.defaultUri
    }

    public get title() {
        return this.options.title
    }

    public get visible() {
        return this._showing
    }

    public get defaultUri() {
        return this.options.defaultUri
    }

    public get filters() {
        return this.options.filters
    }

    public get acceptButtonLabel() {
        if (this.options.type === 'Save') {
            return this.options.saveLabel
        } else {
            return this.options.openLabel
        }
    }

    public dispose(): void {
        this._disposed = true
        this._showing = false
        this._onDidAcceptItem.dispose()
    }

    public close(): void {
        this._selected = undefined
        this._onDidAcceptItem.fire(this._selected)
        this.dispose()
    }

    public accept() {
        if (this._disposed) {
            throw new Error('Attempted to select from a disposed message')
        }

        this._onDidAcceptItem.fire(this._selected)
        this.dispose()
    }

    public selectItem(item: vscode.Uri): void {
        this._selected = item
        this.accept()
    }

    public selectItems(...items: vscode.Uri[]): void {
        this._selected = items
        this.accept()
    }

    public show(): (FileSystemDialogItem & { select(): void })[] {
        this._showing = true

        return this.items.map(item => {
            return {
                ...item,
                select: () => this.selectItem(item.uri),
            }
        })
    }

    public printDebug() {
        return [
            `type: ${this.options.type}`,
            `title: ${this.title ?? '[no title]'}`,
            `acceptButtonLabel: ${this.acceptButtonLabel ?? '[no label]'}`,
        ].join(', ')
    }

    public static createOpenSaveDialogFn(
        fs: vscode.FileSystem,
        callback?: (dialog: TestFileSystemDialog) => void
    ): Window['showOpenDialog'] {
        return async (options?: vscode.OpenDialogOptions) => {
            const dialog = new TestFileSystemDialog([], { type: 'Open', ...options })

            return new Promise<vscode.Uri[] | undefined>(resolve => {
                dialog.onDidAcceptItem(item => resolve(item instanceof vscode.Uri ? [item] : item))
                dialog.show()
                callback?.(dialog)
            })
        }
    }

    public static createShowSaveDialogFn(
        fs: vscode.FileSystem,
        callback?: (dialog: TestFileSystemDialog) => void
    ): Window['showSaveDialog'] {
        return async (options?: vscode.SaveDialogOptions) => {
            const dialog = new TestFileSystemDialog([], { type: 'Save', ...options })

            return new Promise<vscode.Uri | undefined>(resolve => {
                dialog.onDidAcceptItem(item => resolve(Array.isArray(item) ? item[0] : item))
                dialog.show()
                callback?.(dialog)
            })
        }
    }
}
