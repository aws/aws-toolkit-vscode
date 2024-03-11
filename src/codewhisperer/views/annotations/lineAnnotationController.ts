/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { LineSelection, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { debounce2 } from '../../../shared/utilities/functionUtils'
import { CodeWhispererSource } from '../../commands/types'
import { placeholder } from '../../../shared/vscode/commands2'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { set } from '../../util/commonUtil'
import { AnnotationChangeSource, inlinehintKey } from '../../models/constants'
import globals from '../../../shared/extensionGlobals'
import { Container } from '../../service/serviceContainer'
import { telemetry } from '../../../shared/telemetry/telemetry'

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

type CwsprTutorialUi =
    | 'how_codewhisperer_triggers'
    | 'tab_to_accept'
    | 'manual_trigger'
    | 'insufficient_file_context'
    | 'learn_more'

interface AnnotationState {
    id: string
    name: '' | CwsprTutorialUi
    suppressWhileRunning: boolean
    text: () => string
}

const startState: AnnotationState = {
    id: '0',
    name: '',
    suppressWhileRunning: true,
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
const autotriggerState: AnnotationState & { acceptedCount: number } = {
    id: '1',
    name: 'how_codewhisperer_triggers',
    suppressWhileRunning: true,
    text: () => 'CodeWhisperer Tip 1/3: Start typing to get suggestions',
    acceptedCount: 0,
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
    name: 'tab_to_accept',
    suppressWhileRunning: false,
    text: () => 'CodeWhisperer Tip 1/3: Press [TAB] to accept',
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
const manualtriggerState: AnnotationState & { hasManualTrigger: boolean; hasValidResponse: boolean } = {
    id: '2',
    suppressWhileRunning: true,
    name: 'manual_trigger',
    text: () => {
        if (os.platform() === 'win32') {
            return 'CodeWhisperer Tip 2/3: Trigger suggestions with [Alt] + [C]'
        }

        return 'CodeWhisperer Tip 2/3: Trigger suggestions with [Option] + [C]'
    },
    hasManualTrigger: false,
    hasValidResponse: false,
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
    name: 'insufficient_file_context',
    suppressWhileRunning: true,
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
    name: 'learn_more',
    suppressWhileRunning: true,
    text: () => 'CodeWhisperer Tip 3/3: Hover over suggestions to see menu for more options',
}

const endState: AnnotationState = {
    id: '4',
    name: '',
    suppressWhileRunning: true,
    text: () => '',
}

// const state5: AnnotationState = {}

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined

    private _selections: LineSelection[] | undefined

    private _currentStep: '1' | '2' | '3' | '4' | undefined

    _currentState: AnnotationState = startState

    readonly cwLineHintDecoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 3em',
            // "borderRadius" and "padding" are not available on "after" type of decoration, this is a hack to inject these css prop to "after" content. Refer to https://github.com/microsoft/vscode/issues/68845
            textDecoration: ';border-radius:0.25rem;padding:0.05rem 0.5rem;',
            width: 'fit-content',
            border: '1px solid #ccc',
            borderColor: 'var',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
        borderRadius: '4px',
        borderSpacing: '1px',
    })

    private _acceptedSuggestionCount = 0

    constructor(private readonly container: Container) {
        // this._currentStep = globals.context.globalState.get<'1' | '2' | '3' | undefined>(inlinehintKey)
        this._disposable = vscode.Disposable.from(
            once(this.container._lineTracker.onReady)(this.onReady, this),
            this.subscribeSuggestionAction(true),
            this.container.auth.auth.onDidChangeConnectionState(async e => {
                if (e.state !== 'authenticating') {
                    this.refreshDebounced(vscode.window.activeTextEditor, 'editor')
                }
            }),
            this.container.auth.secondaryAuth.onDidChangeActiveConnection(async () => {
                this.refreshDebounced(vscode.window.activeTextEditor, 'editor')
            })
        )
        this.setLineTracker(true)
    }

    dispose() {
        this.container._lineTracker.unsubscribe(this)
        this._disposable.dispose()
    }

    // TODO: inline tutorial targets "NEW" Codewhisperer users only, existing users should not see it
    // shouldSkip() {}

    isTutorialDone(): boolean {
        // return this._currentState.id === endState.id
        return true
    }

    private _isReady: boolean = false

    private onReady(): void {
        this._isReady = true
        this.refresh(vscode.window.activeTextEditor, 'editor')
    }

    private async onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            return
        }

        this.clear(e.editor)

        if (e.reason === 'content') {
            await this.refreshDebounced(e.editor, e.reason)
            return
        }

        if (e.selections !== undefined) {
            await this.refreshDebounced(e.editor, e.reason)
            return
        }
    }

    clear(editor: vscode.TextEditor | undefined) {
        this._editor?.setDecorations(this.cwLineHintDecoration, [])
        if (editor) {
            editor.setDecorations(this.cwLineHintDecoration, [])
        }
    }

    readonly refreshDebounced = debounce2(
        (editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, e?: any) => {
            this.refresh(editor, source, e)
        },
        250
    )

    async refresh(editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, e?: any) {
        if (this.isTutorialDone()) {
            this.clear(this._editor)
            return
        }
        if (!this.container.auth.isConnectionValid(false)) {
            this.clear(this._editor)
            return
        }

        if (editor == null && this._editor == null) {
            return
        }

        const selections = this.container._lineTracker.selections
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
        if (editor.document == null || !this.container._lineTracker.includes(selections)) {
            return
        }

        // if (cancellation.isCancellationRequested) return
        await this.updateDecorations(editor, selections, source, e)
    }

    async updateDecorations(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        source: AnnotationChangeSource,
        e?: SuggestionActionEvent
    ) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const options = this.getInlineDecoration(editor, lines, source, e) as vscode.DecorationOptions | undefined

        const isCWRunning = RecommendationService.instance.isRunning
        if (isCWRunning && this._currentState.suppressWhileRunning) {
            editor.setDecorations(this.cwLineHintDecoration, [])
            this._selections = lines
            return
        }

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
            if (!this.container._lineTracker.subscribed(this)) {
                this.container._lineTracker.subscribe(
                    this,
                    this.container._lineTracker.onDidChangeActiveLines(this.onActiveLinesChanged, this)
                )
            }

            return
        }

        this.container._lineTracker.unsubscribe(this)
    }

    private subscribeSuggestionAction(enabled: boolean) {
        const disposable = RecommendationService.instance.suggestionActionEvent(e => {
            this.setMetadataForState2(e)

            // can't use refresh because refresh, by design, should only be triggered when there is line selection change
            this.refreshDebounced(e.editor, 'codewhisperer', e)
        })

        return disposable // TODO: InlineCompletionService should deal with unsubscribe/dispose otherwise there will be memory leak
    }

    getInlineDecoration(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        source: AnnotationChangeSource,
        e?: SuggestionActionEvent
    ): Partial<vscode.DecorationOptions> | undefined {
        const sameLine = this._selections ? isSameLine(this._selections[0], lines[0]) : false
        const isEndOfLine = isCursorAtEndOfLine(editor)
        const isCWRunning = RecommendationService.instance.isRunning

        const options = this.textOptions(sameLine, isEndOfLine, isCWRunning, source, e)

        if (!options) {
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

    // TODO: fix the messy logics
    private textOptions(
        isSameLine: boolean,
        isEndOfLine: boolean,
        isCWRunning: boolean,
        source: AnnotationChangeSource,
        e?: SuggestionActionEvent
    ): vscode.ThemableDecorationRenderOptions | undefined {
        // contentChanged will also emit 'selection'
        const textOptions = {
            contentText: '',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            color: 'var(--vscode-editor-background)',
            backgroundColor: 'var(--vscode-foreground)',
        }

        const oldState = this._currentState

        if (this._currentState.id === startState.id) {
            if (isEndOfLine) {
                this._currentState = autotriggerState
                autotriggerState.acceptedCount = RecommendationService.instance.acceptedSuggestionCount
            }
        } else if (this._currentState.id === endState.id) {
            return undefined
        } else {
            // TODO: how to improve readability of this
            if (this._currentState.id === autotriggerState.id) {
                this._currentState = autotriggerState
                if (
                    'acceptedCount' in this._currentState &&
                    (this._currentState.acceptedCount as number) <
                        RecommendationService.instance.acceptedSuggestionCount
                ) {
                    this._currentState = manualtriggerState
                } else if (
                    !isCWRunning &&
                    source === 'codewhisperer' &&
                    e?.response?.recommendationCount &&
                    e?.response?.recommendationCount > 0
                ) {
                    this._currentState = pressTabState
                }
            } else if (this._currentState.id === manualtriggerState.id) {
                this._currentState = manualtriggerState
                // if (e?.response && e.response.recommendationCount === 0 && e.triggerType === 'OnDemand') {
                //     // if user manual triggers but receives an empty suggestion
                //     this._currentState = emptyResponseState
                // }

                if (
                    'hasManualTrigger' in this._currentState &&
                    this._currentState.hasManualTrigger &&
                    'hasValidResponse' in this._currentState &&
                    this._currentState.hasValidResponse
                ) {
                    if (source === 'selection') {
                        this._currentState = tryMoreExState
                    } else {
                        return undefined
                    }
                }
            } else if (this._currentState.id === tryMoreExState.id) {
                this._currentState = endState
            }
        }

        textOptions.contentText = this._currentState.text()
        if (this._currentState.name.length) {
            telemetry.ui_click.emit({ elementId: this._currentState.name })
        }
        return { after: textOptions }
    }

    private setMetadataForState2(e: SuggestionActionEvent) {
        try {
            if (this._currentState.id === manualtriggerState.id && 'hasManualTrigger' in this._currentState) {
                this._currentState.hasManualTrigger = e.triggerType === 'OnDemand'
            }

            if (this._currentState.id === manualtriggerState.id && 'hasValidResponse' in this._currentState) {
                this._currentState.hasValidResponse =
                    e.response?.recommendationCount && e.response?.recommendationCount > 0
            }
        } catch (error) {
            console.log(error)
        }
    }

    private onHover(): vscode.MarkdownString | undefined {
        const str: string = this._currentState.text()
        if (str === tryMoreExState.text()) {
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
