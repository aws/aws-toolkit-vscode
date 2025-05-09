/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import {
    AnnotationChangeSource,
    AuthUtil,
    inlinehintKey,
    runtimeLanguageContext,
    TelemetryHelper,
} from 'aws-core-vscode/codewhisperer'
import { editorUtilities, getLogger, globals, setContext, vscodeUtilities } from 'aws-core-vscode/shared'
import { LinesChangeEvent, LineSelection, LineTracker } from '../stateTracker/lineTracker'
import { telemetry } from 'aws-core-vscode/telemetry'
import { cancellableDebounce } from 'aws-core-vscode/utils'
import { SessionManager } from '../sessionManager'

const case3TimeWindow = 30000 // 30 seconds

const maxSmallIntegerV8 = 2 ** 30 // Max number that can be stored in V8's smis (small integers)

function fromId(id: string | undefined, sessionManager: SessionManager): AnnotationState | undefined {
    switch (id) {
        case AutotriggerState.id:
            return new AutotriggerState(sessionManager)
        case PressTabState.id:
            return new AutotriggerState(sessionManager)
        case ManualtriggerState.id:
            return new ManualtriggerState()
        case TryMoreExState.id:
            return new TryMoreExState()
        case EndState.id:
            return new EndState()
        case InlineChatState.id:
            return new InlineChatState()
        default:
            return undefined
    }
}

interface AnnotationState {
    id: string
    suppressWhileRunning: boolean
    decorationRenderOptions?: vscode.ThemableDecorationAttachmentRenderOptions

    text: () => string
    updateState(changeSource: AnnotationChangeSource, force: boolean): AnnotationState | undefined
    isNextState(state: AnnotationState | undefined): boolean
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
export class AutotriggerState implements AnnotationState {
    static id = 'codewhisperer_learnmore_case_1'
    id = AutotriggerState.id

    suppressWhileRunning = true
    text = () => 'Amazon Q Tip 1/3: Start typing to get suggestions ([ESC] to exit)'
    static acceptedCount = 0

    constructor(private readonly sessionManager: SessionManager) {}

    updateState(changeSource: AnnotationChangeSource, force: boolean): AnnotationState | undefined {
        if (AutotriggerState.acceptedCount < this.sessionManager.acceptedSuggestionCount) {
            return new ManualtriggerState()
        } else if (this.sessionManager.getActiveRecommendation().length > 0) {
            return new PressTabState(this.sessionManager)
        } else {
            return this
        }
    }

    isNextState(state: AnnotationState | undefined): boolean {
        return state instanceof ManualtriggerState
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
export class PressTabState implements AnnotationState {
    static id = 'codewhisperer_learnmore_case_1a'
    id = PressTabState.id

    suppressWhileRunning = false

    text = () => 'Amazon Q Tip 1/3: Press [TAB] to accept ([ESC] to exit)'

    constructor(private readonly sessionManager: SessionManager) {}

    updateState(changeSource: AnnotationChangeSource, force: boolean): AnnotationState | undefined {
        return new AutotriggerState(this.sessionManager).updateState(changeSource, force)
    }

    isNextState(state: AnnotationState | undefined): boolean {
        return state instanceof ManualtriggerState
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
export class ManualtriggerState implements AnnotationState {
    static id = 'codewhisperer_learnmore_case_2'
    id = ManualtriggerState.id

    suppressWhileRunning = true

    text = () => {
        if (os.platform() === 'win32') {
            return 'Amazon Q Tip 2/3: Invoke suggestions with [Alt] + [C] ([ESC] to exit)'
        }

        return 'Amazon Q Tip 2/3: Invoke suggestions with [Option] + [C] ([ESC] to exit)'
    }
    hasManualTrigger: boolean = false
    hasValidResponse: boolean = false

    updateState(changeSource: AnnotationChangeSource, force: boolean): AnnotationState | undefined {
        if (this.hasManualTrigger && this.hasValidResponse) {
            if (changeSource !== 'codewhisperer') {
                return new TryMoreExState()
            } else {
                return undefined
            }
        } else {
            return this
        }
    }

    isNextState(state: AnnotationState | undefined): boolean {
        return state instanceof TryMoreExState
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
export class TryMoreExState implements AnnotationState {
    static id = 'codewhisperer_learnmore_case_3'
    id = TryMoreExState.id

    suppressWhileRunning = true

    text = () => 'Amazon Q Tip 3/3: For settings, open the Amazon Q menu from the status bar ([ESC] to exit)'
    updateState(changeSource: AnnotationChangeSource, force: boolean): AnnotationState {
        if (force) {
            return new EndState()
        }
        return this
    }

    isNextState(state: AnnotationState | undefined): boolean {
        return state instanceof EndState
    }

    static learnmoeCount: number = 0
}

export class EndState implements AnnotationState {
    static id = 'codewhisperer_learnmore_end'
    id = EndState.id

    suppressWhileRunning = true
    text = () => ''
    updateState(changeSource: AnnotationChangeSource, force: boolean): AnnotationState {
        return this
    }
    isNextState(state: AnnotationState): boolean {
        return false
    }
}

export class InlineChatState implements AnnotationState {
    static id = 'amazonq_annotation_inline_chat'
    id = InlineChatState.id
    suppressWhileRunning = false

    text = () => {
        if (os.platform() === 'darwin') {
            return 'Amazon Q: Edit \u2318I'
        }
        return 'Amazon Q: Edit (Ctrl+I)'
    }
    updateState(_changeSource: AnnotationChangeSource, _force: boolean): AnnotationState {
        return this
    }
    isNextState(_state: AnnotationState | undefined): boolean {
        return false
    }
}

/**
 * There are
 * - existing users
 * - new users
 *   -- new users who has not seen tutorial
 *   -- new users who has seen tutorial
 *
 * "existing users" should have the context key "CODEWHISPERER_AUTO_TRIGGER_ENABLED"
 * "new users who has seen tutorial" should have the context key "inlineKey" and "CODEWHISPERER_AUTO_TRIGGER_ENABLED"
 * the remaining grouop of users should belong to "new users who has not seen tutorial"
 */
export class InlineTutorialAnnotation implements vscode.Disposable {
    private readonly _disposable: vscode.Disposable
    private _editor: vscode.TextEditor | undefined

    private _currentState: AnnotationState

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

    constructor(
        private readonly lineTracker: LineTracker,
        private readonly sessionManager: SessionManager
    ) {
        const cachedState = fromId(globals.globalState.get<string>(inlinehintKey), sessionManager)
        const cachedAutotriggerEnabled = globals.globalState.get<boolean>('CODEWHISPERER_AUTO_TRIGGER_ENABLED')

        // new users (has or has not seen tutorial)
        if (cachedAutotriggerEnabled === undefined || cachedState !== undefined) {
            this._currentState = cachedState ?? new AutotriggerState(this.sessionManager)
            getLogger().debug(
                `codewhisperer: new user login, activating inline tutorial. (autotriggerEnabled=${cachedAutotriggerEnabled}; inlineState=${cachedState?.id})`
            )
        } else {
            this._currentState = new EndState()
            getLogger().debug(`codewhisperer: existing user login, disabling inline tutorial.`)
        }

        this._disposable = vscode.Disposable.from(
            vscodeUtilities.subscribeOnce(this.lineTracker.onReady)(async (_) => {
                await this.onReady()
            }),
            this.lineTracker.onDidChangeActiveLines(async (e) => {
                await this.onActiveLinesChanged(e)
            }),
            AuthUtil.instance.auth.onDidChangeConnectionState(async (e) => {
                if (e.state !== 'authenticating') {
                    await this.refresh(vscode.window.activeTextEditor, 'editor')
                }
            }),
            AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(async () => {
                await this.refresh(vscode.window.activeTextEditor, 'editor')
            })
        )
    }

    dispose() {
        this._disposable.dispose()
    }

    private _isReady: boolean = false

    private async onReady(): Promise<void> {
        this._isReady = !(this._currentState instanceof EndState)
        await this._refresh(vscode.window.activeTextEditor, 'editor')
    }

    async triggered(triggerType: vscode.InlineCompletionTriggerKind): Promise<void> {
        await telemetry.withTraceId(async () => {
            if (!this._isReady) {
                return
            }

            if (this._currentState instanceof ManualtriggerState) {
                if (
                    triggerType === vscode.InlineCompletionTriggerKind.Invoke &&
                    this._currentState.hasManualTrigger === false
                ) {
                    this._currentState.hasManualTrigger = true
                }
                if (
                    this.sessionManager.getActiveRecommendation().length > 0 &&
                    this._currentState.hasValidResponse === false
                ) {
                    this._currentState.hasValidResponse = true
                }
            }

            await this.refresh(vscode.window.activeTextEditor, 'codewhisperer')
        }, TelemetryHelper.instance.traceId)
    }

    isTutorialDone(): boolean {
        return this._currentState.id === new EndState().id
    }

    isInlineChatHint(): boolean {
        return this._currentState.id === new InlineChatState().id
    }

    async dismissTutorial() {
        this._currentState = new EndState()
        await setContext('aws.codewhisperer.tutorial.workInProgress', false)
        await globals.globalState.update(inlinehintKey, this._currentState.id)
    }

    /**
     * Trys to show the inline hint, if the tutorial is not finished it will not be shown
     */
    async tryShowInlineHint(): Promise<boolean> {
        if (this.isTutorialDone()) {
            this._isReady = true
            this._currentState = new InlineChatState()
            return true
        }
        return false
    }

    async tryHideInlineHint(): Promise<boolean> {
        if (this._currentState instanceof InlineChatState) {
            this._currentState = new EndState()
            return true
        }
        return false
    }

    private async onActiveLinesChanged(e: LinesChangeEvent) {
        if (!this._isReady) {
            return
        }

        this.clear()

        await this.refresh(e.editor, e.reason)
    }

    clear() {
        this._editor?.setDecorations(this.cwLineHintDecoration, [])
    }

    async refresh(editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, force?: boolean) {
        if (force) {
            this.refreshDebounced.cancel()
            await this._refresh(editor, source, true)
        } else {
            await this.refreshDebounced.promise(editor, source)
        }
    }

    private readonly refreshDebounced = cancellableDebounce(
        async (editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, force?: boolean) => {
            await this._refresh(editor, source, force)
        },
        250
    )

    private async _refresh(editor: vscode.TextEditor | undefined, source: AnnotationChangeSource, force?: boolean) {
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

        const selections = this.lineTracker.selections
        if (editor === undefined || selections === undefined || !editorUtilities.isTextEditor(editor)) {
            this.clear()
            return
        }

        if (this._editor !== editor) {
            // Clear any annotations on the previously active editor
            this.clear()
            this._editor = editor
        }

        // Make sure the editor hasn't died since the await above and that we are still on the same line(s)
        if (editor.document === undefined || !this.lineTracker.includes(selections)) {
            this.clear()
            return
        }

        if (!AuthUtil.instance.isConnectionValid()) {
            this.clear()
            return
        }

        // Disable Tips when language is not supported by Amazon Q.
        if (!runtimeLanguageContext.isLanguageSupported(editor.document)) {
            return
        }

        await this.updateDecorations(editor, selections, source, force)
    }

    private async updateDecorations(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        source: AnnotationChangeSource,
        force?: boolean
    ) {
        const range = editor.document.validateRange(
            new vscode.Range(lines[0].active, maxSmallIntegerV8, lines[0].active, maxSmallIntegerV8)
        )

        const decorationOptions = this.getInlineDecoration(editor, lines, source, force) as
            | vscode.DecorationOptions
            | undefined

        if (decorationOptions === undefined) {
            this.clear()
            await setContext('aws.codewhisperer.tutorial.workInProgress', false)
            return
        } else if (this.isTutorialDone()) {
            // special case
            // Endstate is meaningless and doesnt need to be rendered
            this.clear()
            await this.dismissTutorial()
            return
        } else if (decorationOptions.renderOptions?.after?.contentText === new TryMoreExState().text()) {
            // special case
            // case 3 exit criteria is to fade away in 30s
            setTimeout(async () => {
                await this.refresh(editor, source, true)
            }, case3TimeWindow)
        }

        decorationOptions.range = range

        await globals.globalState.update(inlinehintKey, this._currentState.id)
        if (!this.isInlineChatHint()) {
            await setContext('aws.codewhisperer.tutorial.workInProgress', true)
        }
        editor.setDecorations(this.cwLineHintDecoration, [decorationOptions])
    }

    getInlineDecoration(
        editor: vscode.TextEditor,
        lines: LineSelection[],
        source: AnnotationChangeSource,
        force?: boolean
    ): Partial<vscode.DecorationOptions> | undefined {
        const isCWRunning = this.sessionManager.getActiveSession()?.isRequestInProgress ?? false

        const textOptions: vscode.ThemableDecorationAttachmentRenderOptions = {
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

        const updatedState: AnnotationState | undefined = this._currentState.updateState(source, force ?? false)

        if (updatedState === undefined) {
            return undefined
        }

        if (this._currentState.isNextState(updatedState)) {
            // special case because PressTabState is part of case_1 (1a) which possibly jumps directly from case_1a to case_2 and miss case_1
            if (this._currentState instanceof PressTabState) {
                telemetry.ui_click.emit({ elementId: AutotriggerState.id, passive: true })
            }
            telemetry.ui_click.emit({ elementId: this._currentState.id, passive: true })
        }

        // update state
        this._currentState = updatedState

        // take snapshot of accepted session so that we can compre if there is delta -> users accept 1 suggestion after seeing this state
        AutotriggerState.acceptedCount = this.sessionManager.acceptedSuggestionCount

        textOptions.contentText = this._currentState.text()

        return {
            renderOptions: { after: textOptions },
        }
    }

    public get currentState(): AnnotationState {
        return this._currentState
    }
}
