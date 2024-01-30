/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { debounce } from '../../../shared/utilities/functionUtils'

export interface LineSelection {
    anchor: number
    active: number
}

export interface LinesChangeEvent {
    readonly editor: vscode.TextEditor | undefined
    readonly selections: LineSelection[] | undefined

    readonly reason: 'editor' | 'selection' | 'content'
}

export class LineTracker {
    private _onDidChangeActiveLines = new vscode.EventEmitter<LinesChangeEvent>()
    get onDidChangeActiveLines(): vscode.Event<LinesChangeEvent> {
        return this._onDidChangeActiveLines.event
    }

    private _editor: vscode.TextEditor | undefined
    protected _disposable: vscode.Disposable | undefined
    private _subscriptions = new Map<unknown, vscode.Disposable[]>()

    private _selections: LineSelection[] | undefined

    private _suspended: boolean = false
    get selections(): LineSelection[] | undefined {
        return this._selections
    }

    constructor() {
        console.log(`initializing lineTracker`)
    }

    private onActiveTextEditorChanged(editor: vscode.TextEditor | undefined) {
        if (editor === this._editor) return

        this._editor = editor
        this._selections = toLineSelections(editor?.selections)

        if (this._suspended) {
        } else {
            this.notifyLinesChanged('editor')
        }
    }

    private onTextEditorSelectionChanged(e: vscode.TextEditorSelectionChangeEvent) {
        console.log(`lineTracker: onTextEditorSelectionChanged`)
        // If this isn't for our cached editor and its not a real editor -- kick out
        if (this._editor !== e.textEditor && !isTextEditor(e.textEditor)) return

        const selections = toLineSelections(e.selections)
        if (this._editor === e.textEditor && this.includes(selections)) return

        this._editor = e.textEditor
        this._selections = selections

        this.notifyLinesChanged(this._editor === e.textEditor ? 'selection' : 'editor')
    }

    private async onContentChanged(e: vscode.TextDocumentChangeEvent) {
        if (e.document === vscode.window.activeTextEditor?.document && e.contentChanges.length > 0) {
            console.log(e)
            // await this.notifyLinesChangedDebounced()
            this.notifyLinesChanged('content')
        }
    }

    private notifyLinesChangedDebounced = debounce(() => this.notifyLinesChanged('content'), 250)

    private notifyLinesChanged(reason: 'editor' | 'selection' | 'content') {
        const e: LinesChangeEvent = { editor: this._editor, selections: this.selections, reason: reason }

        void this.fireLinesChanged(e)
    }

    private async fireLinesChanged(e: LinesChangeEvent) {
        this._onDidChangeActiveLines.fire(e)
    }

    subscribe(subscriber: unknown, subscription: vscode.Disposable) {
        const disposable = {
            dispose: () => this.unsubscribe(subscriber),
        }

        const first = this._subscriptions.size === 0

        let subs = this._subscriptions.get(subscriber)
        if (subs == null) {
            subs = [subscription]
            this._subscriptions.set(subscriber, subs)
        } else {
            subs.push(subscription)
        }

        if (first) {
            this._disposable = vscode.Disposable.from(
                vscode.window.onDidChangeActiveTextEditor(this.onActiveTextEditorChanged, this),
                vscode.window.onDidChangeTextEditorSelection(this.onTextEditorSelectionChanged, this),
                vscode.workspace.onDidChangeTextDocument(this.onContentChanged, this),
                disposable
            )

            queueMicrotask(() => this.onActiveTextEditorChanged(vscode.window.activeTextEditor))
        }
        return this._disposable
        // return disposable
    }

    unsubscribe(subscriber: unknown) {
        const subs = this._subscriptions.get(subscriber)
        if (subs == null) return

        this._subscriptions.delete(subscriber)
        for (const sub of subs) {
            sub.dispose()
        }

        if (this._subscriptions.size !== 0) return

        this._disposable?.dispose()
        this._disposable = undefined
    }

    subscribed(subscriber: unknown) {
        return this._subscriptions.has(subscriber)
    }

    includes(selections: LineSelection[]): boolean
    includes(line: number, options?: { activeOnly: boolean }): boolean
    includes(lineOrSelections: number | LineSelection[], options?: { activeOnly: boolean }): boolean {
        if (typeof lineOrSelections !== 'number') {
            return isIncluded(lineOrSelections, this._selections)
        }

        if (this._selections == null || this._selections.length === 0) return false

        const line = lineOrSelections
        const activeOnly = options?.activeOnly ?? true

        for (const selection of this._selections) {
            if (
                line === selection.active ||
                (!activeOnly &&
                    ((selection.anchor >= line && line >= selection.active) ||
                        (selection.active >= line && line >= selection.anchor)))
            ) {
                return true
            }
        }
        return false
    }
}

function isIncluded(selections: LineSelection[] | undefined, within: LineSelection[] | undefined): boolean {
    if (selections == null && within == null) return true
    if (selections == null || within == null || selections.length !== within.length) return false

    return selections.every((s, i) => {
        const match = within[i]
        return s.active === match.active && s.anchor === match.anchor
    })
}

function toLineSelections(selections: readonly vscode.Selection[]): LineSelection[]
function toLineSelections(selections: readonly vscode.Selection[] | undefined): LineSelection[] | undefined
function toLineSelections(selections: readonly vscode.Selection[] | undefined) {
    return selections?.map(s => ({ active: s.active.line, anchor: s.anchor.line }))
}
