/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { debounce2 } from '../../../shared/utilities/functionUtils'
import { AuthUtil } from '../../util/authUtil'
import { CodeWhispererSource } from '../../commands/types'
import { placeholder } from '../../../shared/vscode/commands2'

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

export function once<T>(event: vscode.Event<T>): vscode.Event<T> {
    return (listener: (e: T) => unknown, thisArgs?: unknown) => {
        const result = event(e => {
            result.dispose()
            return listener.call(thisArgs, e)
        })

        return result
    }
}

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined
    private _suspended = false

    private _selections: LineSelection[] | undefined

    private _currentStep: '1' | '2' | '3' | undefined = undefined

    readonly cwLineHintDecoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 3em',
            textDecoration: 'none',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
    })

    private _inlineText: string | undefined = undefined

    constructor(private readonly lineTracker: LineTracker) {
        this._disposable = vscode.Disposable.from(once(this.lineTracker.onReady)(this.onReady, this))
        this.setLineTracker(true)
    }

    dispose() {
        this.lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        console.log('onReady')
        this._isReady = true
        this.refresh(vscode.window.activeTextEditor, 'editor')
    }

    private async onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            return
        }

        this.clear(e.editor)

        if (e.reason === 'content') {
            await this.refreshDebounced2(e.editor, e.reason)
            return
        }

        if (e.selections !== undefined) {
            // await this.refresh(e.editor, e.reason)
            await this.refreshDebounced2(e.editor, e.reason)
            return
        }
    }

    clear(editor: vscode.TextEditor | undefined) {
        this._editor?.setDecorations(this.cwLineHintDecoration, [])
        if (editor) {
            editor.setDecorations(this.cwLineHintDecoration, [])
        }
    }

    readonly refreshDebounced2 = debounce2((editor, reason) => {
        this.refresh(editor, reason)
    }, 250)

    async refresh(editor: vscode.TextEditor | undefined, reason: 'selection' | 'content' | 'editor') {
        if (
            !AuthUtil.instance.isConnected() ||
            !AuthUtil.instance.isConnectionValid() ||
            AuthUtil.instance.isConnectionExpired()
        ) {
            this.clear(this._editor)
            return
        }

        if (editor == null && this._editor == null) {
            return
        }

        const selections = this.lineTracker.selections
        if (editor == null || selections == null || !isTextEditor(editor)) {
            if (!selections) {
                console.log('selection is undefined')
            }
            this.clear(this._editor)
            return
        }

        if (this._editor !== editor) {
            // Clear any annotations on the previously active editor
            this.clear(this._editor)
            this._editor = editor
        }

        if (this._suspended) {
            this.clear(editor)
            return
        }

        // Make sure the editor hasn't died since the await above and that we are still on the same line(s)
        if (editor.document == null || !this.lineTracker.includes(selections)) {
            return
        }

        // if (cancellation.isCancellationRequested) return
        await this.updateDecorations(editor, selections)
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[]) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const isSameline = this._selections ? isSameLine(this._selections[0], lines[0]) : false
        console.log(`isSameLine: ${isSameLine}`)
        const options = this.getInlineDecoration(isSameline) as vscode.DecorationOptions | undefined
        if (!options) {
            return
        }

        options.range = range
        console.log(range)
        this._selections = lines
        editor.setDecorations(this.cwLineHintDecoration, [options])
    }

    private setLineTracker(enabled: boolean) {
        if (enabled) {
            if (!this.lineTracker.subscribed(this)) {
                this.lineTracker.subscribe(
                    this,
                    this.lineTracker.onDidChangeActiveLines(this.onActiveLinesChanged, this)
                )
            }

            return
        }

        this.lineTracker.unsubscribe(this)
    }

    getInlineDecoration(
        isSameLine: boolean,
        scrollable: boolean = true
    ): Partial<vscode.DecorationOptions> | undefined {
        console.log(`getInlineDecoration: ${isSameLine}`)
        const options = this.textOptions(isSameLine)
        console.log(options)
        if (!options) {
            console.log(`option is undefinedxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
            return undefined
        }

        const renderOptions: {
            renderOptions: vscode.ThemableDecorationRenderOptions
            hoverMessage: vscode.DecorationOptions['hoverMessage']
        } = {
            renderOptions: options,
            hoverMessage: this.onHover(),
        }

        return renderOptions
    }

    private textOptions(
        isSameLine: boolean,
        scrollable: boolean = true
    ): vscode.ThemableDecorationRenderOptions | undefined {
        const textOptions = {
            contentText: '',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: `none;${scrollable ? '' : ' position: absolute;'}`,
            color: '#8E8E8E',
        }

        if (isSameLine && this._inlineText) {
            console.log(`isSameline, will use previous text`)
            textOptions.contentText = this._inlineText
            return { after: textOptions }
        }

        if (!this._currentStep) {
            textOptions.contentText = 'CodeWhisperer suggests code as you type, press [TAB] to accept'

            console.log('set to 1')
            this._currentStep = '1'

            console.log('CodeWhisperer suggests code as you type, press [TAB] to accept')
        } else if (this._currentStep === '1') {
            textOptions.contentText = '[Option] + [C] triggers CodeWhisperer manually'
            console.log('[Option] + [C] triggers CodeWhisperer manually')

            this._currentStep = '2'
        } else if (this._currentStep === '2') {
            textOptions.contentText = `First CodeWhisperer suggestion accepted!`

            this._currentStep = '3'
        } else {
            //TODO: uncomment
            // return undefined

            textOptions.contentText = 'Congrat, you just finish CodeWhisperer tutorial!'
        }

        this._inlineText = textOptions.contentText

        return { after: textOptions }
    }

    private onHover(): vscode.MarkdownString | undefined {
        if (this._currentStep === '2') {
            const source: CodeWhispererSource = 'vscodeComponent'
            const md = new vscode.MarkdownString(
                `[Learn more CodeWhisperer examples](command:aws.codeWhisperer.gettingStarted?${encodeURI(
                    JSON.stringify([placeholder, source])
                )})`
            )
            // to enable link to a declared command, need to set isTrusted = true
            md.isTrusted = true

            return md
        }

        return undefined
    }
}

function isSameLine(s1: LineSelection, s2: LineSelection) {
    return s1.active === s2.active && s2.anchor === s2.anchor
}
