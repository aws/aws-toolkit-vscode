/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { LineSelection, LinesChangeEvent } from './lineTracker'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { cancellableDebounce } from '../../../shared/utilities/functionUtils'
import { subscribeOnce } from '../../../shared/utilities/vsCodeUtils'
import { RecommendationService, SuggestionActionEvent } from '../../service/recommendationService'
import { set } from '../../util/commonUtil'
import { AnnotationChangeSource, autoTriggerEnabledKey, inlinehintKey, inlinehintWipKey } from '../../models/constants'
import globals from '../../../shared/extensionGlobals'
import { Container } from '../../service/serviceContainer'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { getLogger } from '../../../shared/logger/logger'
import { Commands } from '../../../shared/vscode/commands2'
import { session } from '../../util/codeWhispererSession'
import { RecommendationHandler } from '../../service/recommendationHandler'

const case3TimeWindow = 30000 // 30 seconds

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

type CwsprTutorialUi =
    | 'codewhisperer_learnmore_how_codewhisperer_triggers'
    | 'codewhisperer_learnmore_tab_to_accept'
    | 'codewhisperer_learnmore_manual_trigger'
    | 'codewhisperer_learnmore_learn_more'

function fromId(id: string | undefined): AnnotationState | undefined {
    switch (id) {
        case 'codewhisperer_learnmore_how_codewhisperer_triggers':
            return new AutotriggerState()
        case 'codewhisperer_learnmore_tab_to_accept':
            return new AutotriggerState()
        case 'codewhisperer_learnmore_manual_trigger':
            return new ManualtriggerState()
        case 'codewhisperer_learnmore_learn_more':
            return new TryMoreExState()
        case 'codewhisperer_learnmore_end':
            return new EndState()
        default:
            return undefined
    }
}

interface AnnotationState {
    id: string | CwsprTutorialUi
    suppressWhileRunning: boolean
    text: () => string
    nextState<T extends object>(data: T): AnnotationState | undefined
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
    static #id = 'codewhisperer_learnmore_case_1'
    id = AutotriggerState.#id

    suppressWhileRunning = true
    text = () => 'CodeWhisperer Tip 1/3: Start typing to get suggestions ([ESC] to exit)'
    static acceptedCount = 0

    nextState<T extends object>(data: T): AnnotationState | undefined {
        console.log('State.acceptedCnt=', AutotriggerState.acceptedCount)
        console.log('RecommendationService.acceptedCnt=', RecommendationService.instance.acceptedSuggestionCount)
        if (AutotriggerState.acceptedCount < RecommendationService.instance.acceptedSuggestionCount) {
            return new ManualtriggerState()
        } else if (session.recommendations.length > 0 && RecommendationHandler.instance.isSuggestionVisible()) {
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
    static #id = 'codewhisperer_learnmore_case_1a'
    id = PressTabState.#id

    suppressWhileRunning = false
    text = () => 'CodeWhisperer Tip 1/3: Press [TAB] to accept ([ESC] to exit)'

    nextState(data: any): AnnotationState | undefined {
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
    static #id = 'codewhisperer_learnmore_case_2'
    id = ManualtriggerState.#id

    suppressWhileRunning = true

    text = () => {
        if (os.platform() === 'win32') {
            return 'CodeWhisperer Tip 2/3: Invoke suggestions with [Alt] + [C] ([ESC] to exit)'
        }

        return 'CodeWhisperer Tip 2/3: Invoke suggestions with [Option] + [C] ([ESC] to exit)'
    }
    hasManualTrigger: boolean = false
    hasValidResponse: boolean = false

    nextState(data: any): AnnotationState | undefined {
        if (this.hasManualTrigger && this.hasValidResponse) {
            if ('source' in data && data.source !== 'codewhisperer') {
                return new TryMoreExState()
            } else {
                return undefined
            }
        } else {
            return this
        }
    }
}

/**
 * case 3: Learn more
 * Trigger Criteria:
 *  User exists case 2 &&
 *      User navigates to a new line
 *
 * Exit criteria:
 *  User accepts or rejects the suggestion
 */
class TryMoreExState implements AnnotationState {
    static #id = 'codewhisperer_learnmore_case_3'
    id = TryMoreExState.#id

    suppressWhileRunning = true
    hasUserClickStatusbar: boolean = false

    text = () => 'CodeWhisperer Tip 3/3: For settings, open the CodeWhisperer menu from the status bar ([ESC] to exit)'
    nextState(data: any): AnnotationState {
        if (this.hasUserClickStatusbar) {
            return new EndState()
        }
        return this
    }

    static triggerCount: number = 0
    static learnmoeCount: number = 0
}

class EndState implements AnnotationState {
    static #id = 'codewhisperer_learnmore_end'
    id = EndState.#id

    suppressWhileRunning = true
    text = () => ''
    nextState(data: any): AnnotationState {
        return this
    }
}

/**
 * There are
 * - existing users
 * - new users
 *   -- new users who has not seen tutorial
 *   -- new users who has seen tutorial
 *
 * "existing users" should have the context key "autoTriggerEnabledKey"
 * "new users who has seen tutorial" should have the context key "inlineKey" and "autoTriggerEnabledKey"
 * the remaining grouop of users should belong to "new users who has not seen tutorial"
 */
export class LineAnnotationController implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined

    private _currentState: AnnotationState

    private _seen: Set<string> = new Set()

    private readonly cwLineHintDecoration: vscode.TextEditorDecorationType =
        vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 3em',
                // "borderRadius" and "padding" are not available on "after" type of decoration, this is a hack to inject these css prop to "after" content. Refer to https://github.com/microsoft/vscode/issues/68845
                textDecoration: ';border-radius:0.25rem;padding:0rem 0.5rem;',
                width: 'fit-content',
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
        })

    constructor(private readonly container: Container) {
        const cachedState = fromId(globals.context.globalState.get<string>(inlinehintKey))
        const cachedAutotriggerEnabled = globals.context.globalState.get<boolean>(autoTriggerEnabledKey)

        // new users (has or has not seen tutorial)
        if (cachedAutotriggerEnabled === undefined || cachedState !== undefined) {
            this._currentState = cachedState ?? new AutotriggerState()
            getLogger().debug(
                `codewhisperer: new user login, activating inline tutorial. (autotriggerEnabled=${cachedAutotriggerEnabled}); inlineState=${cachedState}`
            )
        } else {
            this._currentState = new EndState()
            getLogger().debug(
                `codewhisperer: existing user login, disabling inline tutorial. (autotriggerEnabled=${cachedAutotriggerEnabled}); inlineState=${cachedState}`
            )
        }

        // todo: remove
        this._currentState = new AutotriggerState()

        this._disposable = vscode.Disposable.from(
            subscribeOnce(this.container._lineTracker.onReady)(this.onReady, this),
            RecommendationService.instance.suggestionActionEvent(e => {
                if (!this._isReady) {
                    return
                }

                if (this._currentState instanceof ManualtriggerState) {
                    if (e.triggerType === 'OnDemand' && this._currentState.hasManualTrigger === false) {
                        this._currentState.hasManualTrigger = true
                    }
                    if (
                        e.response?.recommendationCount !== undefined &&
                        e.response?.recommendationCount > 0 &&
                        this._currentState.hasValidResponse === false
                    ) {
                        this._currentState.hasValidResponse = true
                    }
                }

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
            }),
            Commands.register('aws.codeWhisperer.dismissTutorial', async () => {
                const editor = vscode.window.activeTextEditor
                if (editor) {
                    this.clear()
                    this._currentState = new EndState()
                    await vscode.commands.executeCommand('setContext', inlinehintWipKey, false)
                    getLogger().debug(`codewhisperer: user dismiss tutorial.`)
                }
            })
        )
    }

    dispose() {
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private onReady(): void {
        this._isReady = !(this._currentState instanceof EndState)
        this._refresh(vscode.window.activeTextEditor, 'editor')
    }

    isTutorialDone(): boolean {
        return this._currentState.id === new EndState().id
        // return true
    }

    clickStatusBar() {
        if (this._currentState instanceof TryMoreExState) {
            this._currentState.hasUserClickStatusbar = true

            this.refresh(vscode.window.activeTextEditor, 'editor')
        }
    }

    async markTutorialDone() {
        await vscode.commands.executeCommand('setContext', inlinehintWipKey, false)
        this._currentState = new EndState()
    }

    private async onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            return
        }

        this.clear()

        if (e.reason === 'content') {
            await this.refresh(e.editor, e.reason)
            return
        }

        if (e.selections !== undefined) {
            await this.refresh(e.editor, e.reason)
            return
        }
    }

    clear() {
        this._editor?.setDecorations(this.cwLineHintDecoration, [])
    }

    readonly refresh = cancellableDebounce(
        (editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, e?: any) => {
            this._refresh(editor, source, e)
        },
        250
    ).promise

    private async _refresh(editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, e?: any) {
        if (!this._isReady) {
            this.clear()
            return
        }

        if (this.isTutorialDone()) {
            this.clear()
            return
        }

        if (editor === undefined && this._editor === undefined) {
            this.clear()
            return
        }

        const selections = this.container._lineTracker.selections
        if (editor === undefined || selections === undefined || !isTextEditor(editor)) {
            this.clear()
            return
        }

        if (this._editor !== editor) {
            // Clear any annotations on the previously active editor
            this.clear()
            this._editor = editor
        }

        // Make sure the editor hasn't died since the await above and that we are still on the same line(s)
        if (editor.document === undefined || !this.container._lineTracker.includes(selections)) {
            this.clear()
            return
        }

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

        if (decorationOptions === undefined) {
            this.clear()
            await vscode.commands.executeCommand('setContext', inlinehintWipKey, false)
            return
        } else if (this.isTutorialDone()) {
            // special case
            // Endstate is meaningless and doesnt need to be rendered
            this.clear()
            this.markTutorialDone()
            return
        } else if (decorationOptions.renderOptions?.after?.contentText === new TryMoreExState().text()) {
            // special case
            // case 3 exit criteria is to fade away in 30s
            setTimeout(async () => {
                this._currentState = new EndState()
                await this.refresh(editor, source, e)
            }, case3TimeWindow)
        }

        decorationOptions.range = range

        await set(inlinehintKey, this._currentState.id, globals.context.globalState)
        vscode.commands.executeCommand('setContext', inlinehintWipKey, true)
        editor.setDecorations(this.cwLineHintDecoration, [decorationOptions])
    }

    getInlineDecoration(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        source: AnnotationChangeSource,
        e?: SuggestionActionEvent
    ): Partial<vscode.DecorationOptions> | undefined {
        const isCWRunning = RecommendationService.instance.isRunning

        const textOptions = {
            contentText: '',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            color: 'var(--vscode-editor-background)',
            backgroundColor: 'var(--vscode-foreground)',
        }

        if (isCWRunning && this._currentState.suppressWhileRunning) {
            return undefined
        }

        const nextState = this._currentState.nextState({
            isCWRunning: isCWRunning,
            source: source,
            recommendationCount: e?.response?.recommendationCount ?? 0,
        })

        if (nextState === undefined) {
            return undefined
        }

        if (!this._seen.has(nextState.id)) {
            try {
                telemetry.ui_click.emit({ elementId: this._currentState.id, passive: true })
            } catch (e) {}
        }

        // update state
        this._currentState = nextState
        this._seen.add(this._currentState.id)
        // take snapshot of accepted session so that we can compre if there is delta -> users accept 1 suggestion after seeing this state
        AutotriggerState.acceptedCount = RecommendationService.instance.acceptedSuggestionCount
        // take snapshot of total trigger count so that we can compare if there is delta -> users accept/reject suggestions after seeing this state
        TryMoreExState.triggerCount = RecommendationService.instance.totalValidTriggerCount

        textOptions.contentText = this._currentState.text()

        return {
            renderOptions: { after: textOptions },
        }
    }
}
