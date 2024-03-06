/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { LineSelection, LineTracker, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { debounce2 } from '../../../shared/utilities/functionUtils'
import { AuthUtil } from '../../util/authUtil'
import { CodeWhispererSource } from '../../commands/types'
import { placeholder } from '../../../shared/vscode/commands2'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { set } from '../../util/commonUtil'
import { inlinehintKey, suggestionDetailReferenceText } from '../../models/constants'
import globals from '../../../shared/extensionGlobals'
import { RecommendationHandler } from '../../service/recommendationHandler'
import { CodewhispererTriggerType } from '../../../shared/telemetry/telemetry'
import { GetRecommendationsResponse } from '../../models/model'

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

interface AnnotationState {
    id: string
    text: () => string
}

const startState: AnnotationState = {
    id: '0',
    text: () => '',
}

/**
 * case 1: How Cwspr triggers
 * Trigger Criteria:
 *  User opens an editor file &&
 *      CW is not providing a suggestion &&
 *      User has not accepted any suggestion
 *
 * Exit criteria:
 *  User accepts 1 suggestion
 *
 */
const autotriggerState: AnnotationState = {
    id: '1',
    text: () => 'CodeWhisperer suggests code as you type, press [TAB] to accept',
}

/**
 * case 1-a: Tab to accept
 * Trigger Criteria:
 *  Case 1 &&
 *      Inline suggestion is being shown
 *
 * Exit criteria:
 *  User accepts 1 suggestion
 */
const pressTabState: AnnotationState = {
    id: '1',
    text: () => 'Press [TAB] to accept the suggestion',
}

/**
 * case 2: Manual trigger
 * Trigger Criteria:
 *  User exists case 1 &&
 *      User navigates to a new line
 *
 * Exit criteria:
 *  User inokes manual trigger shortcut
 */
const manualtriggerState: AnnotationState = {
    id: '2',
    text: () => {
        if (os.platform() === 'win32') {
            return '[Alt] + [C] triggers CodeWhisperer manually'
        }

        return '[Option] + [C] triggers CodeWhisperer manually'
    },
}

/**
 * case 2-a: insufficient file context
 * Trigger Criteria:
 *  Case 2 &&
 *      User invokes a manual trigger &&
 *      no suggestion is returned
 *
 * Exit criteria:
 *  ??????
 */
const emptyResponseState: AnnotationState = {
    id: '2',
    text: () => 'Try CodeWhisperer on an existing file with code for best results',
}

/**
 * case 3: Learn more
 * Trigger Criteria:
 *  User exists case 2 &&
 *      User navigates to a new line
 *
 * Exit criteria:
 *  User inokes manual trigger shortcut
 */
const tryMoreExState: AnnotationState = {
    id: '3',
    text: () => 'Try more examples (hover)',
}

const endState: AnnotationState = {
    id: '4',
    text: () => '',
}

// const state5: AnnotationState = {}

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined

    private _selections: LineSelection[] | undefined

    private _currentStep: '1' | '2' | '3' | '4' | undefined

    private _currentState: AnnotationState = startState

    readonly cwLineHintDecoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 3em',
            textDecoration: 'none',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
    })

    private _acceptedSuggestionCount = 0

    constructor(private readonly lineTracker: LineTracker, private readonly auth: AuthUtil) {
        // this._currentStep = globals.context.globalState.get<'1' | '2' | '3' | undefined>(inlinehintKey)
        this._disposable = vscode.Disposable.from(
            once(this.lineTracker.onReady)(this.onReady, this),
            this.setCWInlineService(true),
            this.auth.auth.onDidChangeConnectionState(async e => {
                if (e.state !== 'authenticating') {
                    this.refreshDebounced(vscode.window.activeTextEditor)
                }
            }),
            this.auth.secondaryAuth.onDidChangeActiveConnection(async () => {
                this.refreshDebounced(vscode.window.activeTextEditor)
            })
        )
        this.setLineTracker(true)
    }

    dispose() {
        this.lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        this._isReady = true
        this.refresh(vscode.window.activeTextEditor)
    }

    private async onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            return
        }

        this.clear(e.editor)

        if (e.reason === 'content') {
            await this.refreshDebounced(e.editor)
            return
        }

        if (e.selections !== undefined) {
            await this.refreshDebounced(e.editor)
            return
        }
    }

    clear(editor: vscode.TextEditor | undefined) {
        this._editor?.setDecorations(this.cwLineHintDecoration, [])
        if (editor) {
            editor.setDecorations(this.cwLineHintDecoration, [])
        }
    }

    readonly refreshDebounced = debounce2((editor, e?) => {
        this.refresh(editor, e)
    }, 250)

    async refresh(editor: vscode.TextEditor | undefined, option?: SuggestionActionEvent) {
        if (!this.auth.isConnectionValid(false)) {
            this.clear(this._editor)
            return
        }

        if (editor == null && this._editor == null) {
            return
        }

        const selections = this.lineTracker.selections
        if (editor == null || selections == null || !isTextEditor(editor)) {
            this.clear(this._editor)
            return
        }

        if (this._editor !== editor) {
            // Clear any annotations on the previously active editor
            this.clear(this._editor)
            this._editor = editor
        }

        // Make sure the editor hasn't died since the await above and that we are still on the same line(s)
        if (editor.document == null || !this.lineTracker.includes(selections)) {
            return
        }

        // if (cancellation.isCancellationRequested) return
        await this.updateDecorations(editor, selections, option)
    }

    async updateDecorations(editor: vscode.TextEditor, lines: LineSelection[], option?: SuggestionActionEvent) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const isCWRunning = RecommendationService.instance.isRunning
        if (isCWRunning) {
            editor.setDecorations(this.cwLineHintDecoration, [])
            this._selections = lines
            return
        }

        const options = this.getInlineDecoration(editor, lines, option) as vscode.DecorationOptions | undefined
        if (!options) {
            this.clear(this._editor)
            this._selections = lines
            return
        }

        options.range = range
        this._selections = lines
        await set(inlinehintKey, this._currentStep, globals.context.globalState)
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

    private setCWInlineService(enabled: boolean) {
        const disposable = RecommendationService.instance.suggestionActionEvent(e => {
            // can't use refresh because refresh, by design, should only be triggered when there is line selection change
            this.refreshDebounced(e.editor, e)
        })

        return disposable // TODO: InlineCompletionService should deal with unsubscribe/dispose otherwise there will be memory leak
    }

    getInlineDecoration(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        e?: SuggestionActionEvent
    ): Partial<vscode.DecorationOptions> | undefined {
        const sameLine = this._selections ? isSameLine(this._selections[0], lines[0]) : false
        const isEndOfLine = isCursorAtEndOfLine(editor)

        const options = this.textOptions(sameLine, isEndOfLine, e)

        if (!options) {
            return undefined
        }

        const renderOptions: {
            renderOptions: vscode.ThemableDecorationRenderOptions
            hoverMessage: vscode.DecorationOptions['hoverMessage']
        } = {
            renderOptions: options,
            hoverMessage: this.onHover(options.after?.contentText),
        }

        return renderOptions
    }

    // TODO: fix the messy logics
    private textOptions(
        isSameLine: boolean,
        isEndOfLine: boolean,
        e?: SuggestionActionEvent
    ): vscode.ThemableDecorationRenderOptions | undefined {
        const textOptions = {
            contentText: '',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            color: '#8E8E8E',
        }

        if (this._currentState.id === startState.id) {
            if (isEndOfLine) {
                this._currentState = autotriggerState
            }
        } else if (this._currentState.id === endState.id) {
            this._acceptedSuggestionCount = RecommendationService.instance.acceptedSuggestionCount
            return undefined
        } else {
            // TODO: how to modyfy this
            // when users are typing at the same line, not move forward
            if (isSameLine && !e && this._currentState.id !== manualtriggerState.id) {
                textOptions.contentText = this._currentState.text()
                this._acceptedSuggestionCount = RecommendationService.instance.acceptedSuggestionCount
                console.log('0000000000000000000')
                return { after: textOptions }
            } else if (this._currentState.id === autotriggerState.id) {
                // if (this._acceptedSuggestionCount === RecommendationService.instance.acceptedSuggestionCount) {
                //     console.log('1111111111111111111')
                // } else {
                //     console.log('2222222222222222222')
                //     this._currentState = manualtriggerState
                // }

                this._currentState = manualtriggerState
            } else if (this._currentState.id === manualtriggerState.id) {
                this._currentState = manualtriggerState
                if (e?.response && e.response.recommendationCount === 0 && e.triggerType === 'OnDemand') {
                    // if user manual triggers but receives an empty suggestion
                    this._currentState = emptyResponseState
                } else if (!RecommendationService.instance.manualTriggered) {
                    // [2] unless users have a valid manual trigger, we won't show next hint
                    // do not do anything
                } else {
                    this._currentState = tryMoreExState
                }
            } else if (this._currentState.id === tryMoreExState.id) {
                this._currentState = endState
            }
        }

        this._acceptedSuggestionCount = RecommendationService.instance.acceptedSuggestionCount
        textOptions.contentText = this._currentState.text()
        return { after: textOptions }
    }

    private onHover(str: string | undefined): vscode.MarkdownString | undefined {
        if (str === 'Try more examples with CodeWhisperer in the IDE') {
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

function isCursorAtEndOfLine(editor: vscode.TextEditor): boolean {
    const cursorPosition = editor.selection.active
    const endOfLine = editor.document.lineAt(cursorPosition.line).range.end
    return cursorPosition.isEqual(endOfLine)
}
