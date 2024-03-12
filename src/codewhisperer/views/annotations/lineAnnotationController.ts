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
    | 'codewhisperer_learnmore_how_codewhisperer_triggers'
    | 'codewhisperer_learnmore_tab_to_accept'
    | 'codewhisperer_learnmore_manual_trigger'
    | 'codewhisperer_learnmore_insufficient_file_context'
    | 'codewhisperer_learnmore_learn_more'

interface AnnotationState {
    id: string | CwsprTutorialUi
    suppressWhileRunning: boolean
    text: () => string
    nextState<T extends object>(data: T): AnnotationState
}

class StartState implements AnnotationState {
    id = 'start'
    suppressWhileRunning = true
    text = () => ''

    nextState<T extends object>(data: T): AnnotationState {
        if ('isEndOfLine' in data && data.isEndOfLine) {
            return new AutotriggerState()
        } else {
            return this
        }
    }
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
class AutotriggerState implements AnnotationState {
    id = 'codewhisperer_learnmore_how_codewhisperer_triggers'
    suppressWhileRunning = true
    text = () => 'CodeWhisperer Tip 1/3: Start typing to get suggestions'
    static acceptedCount = 0

    nextState<T extends object>(data: T): AnnotationState {
        if (AutotriggerState.acceptedCount < RecommendationService.instance.acceptedSuggestionCount) {
            return new ManualtriggerState()
        } else if (
            'source' in data &&
            data.source === 'codewhisperer' &&
            'isCWRunning' in data &&
            data.isCWRunning === false &&
            'recommendationCount' in data &&
            (data.recommendationCount as number) > 0
        ) {
            return new PressTabState()
        } else {
            return this
        }
    }
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
class PressTabState implements AnnotationState {
    id = 'codewhisperer_learnmore_tab_to_accept'
    suppressWhileRunning = false
    text = () => 'CodeWhisperer Tip 1/3: Press [TAB] to accept'

    nextState(data: any): AnnotationState {
        return new AutotriggerState().nextState(data)
    }
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
class ManualtriggerState implements AnnotationState {
    id = 'codewhisperer_learnmore_manual_trigger'
    suppressWhileRunning = true

    text = () => {
        if (os.platform() === 'win32') {
            return 'CodeWhisperer Tip 2/3: Trigger suggestions with [Alt] + [C]'
        }

        return 'CodeWhisperer Tip 2/3: Trigger suggestions with [Option] + [C]'
    }
    static hasManualTrigger: boolean = false
    static hasValidResponse: boolean = false

    nextState(data: any): AnnotationState {
        if (
            ManualtriggerState.hasManualTrigger &&
            ManualtriggerState.hasValidResponse &&
            'source' in data &&
            data.source === 'selection'
        ) {
            return new TryMoreExState()
        } else {
            return this
        }
    }
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
class EmptyResponseState implements AnnotationState {
    id = 'codewhisperer_learnmore_insufficient_file_context'

    suppressWhileRunning = true
    text = () => 'Try CodeWhisperer on an existing file with code for best results'
    nextState(data: any): AnnotationState {
        return this
    }
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
class TryMoreExState implements AnnotationState {
    id = 'codewhisperer_learnmore_learn_more'

    suppressWhileRunning = true
    text = () => 'CodeWhisperer Tip 3/3: Hover over suggestions to see menu for more options'
    nextState(data: any): AnnotationState {
        return new EndState()
    }
}

class EndState implements AnnotationState {
    id = 'end'
    suppressWhileRunning = true
    text = () => ''
    nextState(data: any): AnnotationState {
        return this
    }
}

export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined

    private _selections: LineSelection[] | undefined

    private _currentStep: '1' | '2' | '3' | '4' | undefined

    private _currentState: AnnotationState = new StartState()

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

    constructor(private readonly container: Container) {
        // this._currentStep = globals.context.globalState.get<'1' | '2' | '3' | undefined>(inlinehintKey)
        this._disposable = vscode.Disposable.from(
            once(this.container._lineTracker.onReady)(this.onReady, this),
            RecommendationService.instance.suggestionActionEvent(e => {
                this.setMetadataForState2(e)

                // can't use refresh because refresh, by design, should only be triggered when there is line selection change
                this.refresh(e.editor, 'codewhisperer', e)
            }),
            this.container._lineTracker.onDidChangeActiveLines(this.onActiveLinesChanged, this),
            this.container.auth.auth.onDidChangeConnectionState(async e => {
                if (e.state !== 'authenticating') {
                    this.refresh(vscode.window.activeTextEditor, 'editor')
                }
            }),
            this.container.auth.secondaryAuth.onDidChangeActiveConnection(async () => {
                this.refresh(vscode.window.activeTextEditor, 'editor')
            })
        )
    }

    dispose() {
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        this._isReady = true
        this._refresh(vscode.window.activeTextEditor, 'editor')
    }

    // TODO: inline tutorial targets "NEW" Codewhisperer users only, existing users should not see it
    // shouldSkip() {}

    isTutorialDone(): boolean {
        return this._currentState.id === new EndState().id
        // return true
    }

    private async onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            return
        }

        this.clear(e.editor)

        if (e.reason === 'content') {
            await this.refresh(e.editor, e.reason)
            return
        }

        if (e.selections !== undefined) {
            await this.refresh(e.editor, e.reason)
            return
        }
    }

    clear(editor: vscode.TextEditor | undefined) {
        this._editor?.setDecorations(this.cwLineHintDecoration, [])
        if (editor) {
            editor.setDecorations(this.cwLineHintDecoration, [])
        }
    }

    readonly refresh = debounce2((editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, e?: any) => {
        this._refresh(editor, source, e)
    }, 250)

    private async _refresh(editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, e?: any) {
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

    private async updateDecorations(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        source: AnnotationChangeSource,
        e?: SuggestionActionEvent
    ) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const decorationOptions = this.getInlineDecoration(editor, lines, source, e) as
            | vscode.DecorationOptions
            | undefined

        const isCWRunning = RecommendationService.instance.isRunning
        if (isCWRunning && this._currentState.suppressWhileRunning) {
            editor.setDecorations(this.cwLineHintDecoration, [])
            this._selections = lines
            return
        }

        if (!decorationOptions) {
            this.clear(this._editor)
            this._selections = lines
            return
        }

        decorationOptions.range = range
        this._selections = lines
        await set(inlinehintKey, this._currentStep, globals.context.globalState)
        editor.setDecorations(this.cwLineHintDecoration, [decorationOptions])
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

        const renderOptions = this.renderOptions(sameLine, isEndOfLine, isCWRunning, source, e)

        if (!renderOptions) {
            return undefined
        }

        const decoration: {
            renderOptions: vscode.ThemableDecorationRenderOptions
            hoverMessage: vscode.DecorationOptions['hoverMessage']
        } = {
            renderOptions: renderOptions,
            hoverMessage: this.hoverMessage(),
        }

        return decoration
    }

    private renderOptions(
        isSameLine: boolean,
        isEndOfLine: boolean,
        isCWRunning: boolean,
        source: AnnotationChangeSource,
        e?: SuggestionActionEvent
    ): vscode.ThemableDecorationRenderOptions | undefined {
        const textOptions = {
            contentText: '',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            color: 'var(--vscode-editor-background)',
            backgroundColor: 'var(--vscode-foreground)',
        }

        const nextState = this._currentState.nextState({
            isEndOfLine: isEndOfLine,
            isCWRunning: isCWRunning,
            source: source,
            recommendationCount: e?.response?.recommendationCount ?? 0,
        })

        // if state proceed, send a uiClick event for the fulfilled tutorial step
        if (this._currentState.id !== nextState.id && !(this._currentState instanceof StartState)) {
            try {
                telemetry.ui_click.emit({ elementId: this._currentState.id, passive: true })
            } catch (e) {}
        }

        // update state
        this._currentState = nextState

        if (this._currentState instanceof AutotriggerState) {
            AutotriggerState.acceptedCount = RecommendationService.instance.acceptedSuggestionCount
        }

        if (
            this._currentState instanceof ManualtriggerState &&
            ManualtriggerState.hasManualTrigger &&
            ManualtriggerState.hasValidResponse
        ) {
            // when users fulfill the manual trigger step, we will not show anything new until they change to another different line
            return undefined
        }

        if (this._currentState instanceof StartState || this._currentState instanceof EndState) {
            return undefined
        }

        textOptions.contentText = this._currentState.text()
        return { after: textOptions }
    }

    private hoverMessage(): vscode.MarkdownString | undefined {
        const str: string = this._currentState.text()
        if (str === new TryMoreExState().text()) {
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

    private setMetadataForState2(e: SuggestionActionEvent) {
        if (this._currentState instanceof ManualtriggerState) {
            ManualtriggerState.hasManualTrigger = e.triggerType === 'OnDemand'
        }

        if (this._currentState instanceof ManualtriggerState) {
            ManualtriggerState.hasValidResponse =
                (e.response?.recommendationCount !== undefined && e.response?.recommendationCount > 0) ?? false
        }
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
