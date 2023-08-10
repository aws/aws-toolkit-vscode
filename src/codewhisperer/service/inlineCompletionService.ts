/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ConfigurationEntry, vsCodeState } from '../models/model'
import * as CodeWhispererConstants from '../models/constants'
import { ReferenceInlineProvider } from './referenceInlineProvider'
import { DefaultCodeWhispererClient, Recommendation } from '../client/codewhisperer'
import { RecommendationHandler } from './recommendationHandler'
import {
    telemetry,
    CodewhispererAutomatedTriggerType,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry'
import { showTimedMessage } from '../../shared/utilities/messages'
import { getLogger } from '../../shared/logger/logger'
import { TelemetryHelper } from '../util/telemetryHelper'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { Commands } from '../../shared/vscode/commands2'
import { getPrefixSuffixOverlap, isVscHavingRegressionInlineCompletionApi } from '../util/commonUtil'
import globals from '../../shared/extensionGlobals'
import { AuthUtil } from '../util/authUtil'
import { shared } from '../../shared/utilities/functionUtils'
import { ImportAdderProvider } from './importAdderProvider'
import * as AsyncLock from 'async-lock'
import { updateInlineLockKey } from '../models/constants'
import { ClassifierTrigger } from './classifierTrigger'
import { CodeWhispererUserGroupSettings } from '../util/userGroupUtil'

const performance = globalThis.performance ?? require('perf_hooks').performance
const lock = new AsyncLock({ maxPending: 1 })

export class CWInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private activeItemIndex: number | undefined
    public nextMove: number

    private _onDidShow: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidShow: vscode.Event<void> = this._onDidShow.event

    public constructor(itemIndex: number | undefined, firstMove: number) {
        this.activeItemIndex = itemIndex
        this.nextMove = firstMove
    }

    get getActiveItemIndex() {
        return this.activeItemIndex
    }

    public clearActiveItemIndex() {
        this.activeItemIndex = undefined
    }

    // iterate suggestions and stop at index 0 or index len - 1
    private getIteratingIndexes() {
        const len = RecommendationHandler.instance.recommendations.length
        const startIndex = this.activeItemIndex ? this.activeItemIndex : 0
        const index = []
        if (this.nextMove === 0) {
            for (let i = 0; i < len; i++) {
                index.push((startIndex + i) % len)
            }
        } else if (this.nextMove === -1) {
            for (let i = startIndex - 1; i >= 0; i--) {
                index.push(i)
            }
            index.push(startIndex)
        } else {
            for (let i = startIndex + 1; i < len; i++) {
                index.push(i)
            }
            index.push(startIndex)
        }
        return index
    }

    truncateOverlapWithRightContext(document: vscode.TextDocument, suggestion: string, pos: vscode.Position): string {
        const trimmedSuggestion = suggestion.trim()
        // limit of 5000 for right context matching
        const rightContext = document.getText(new vscode.Range(pos, document.positionAt(document.offsetAt(pos) + 5000)))
        const overlap = getPrefixSuffixOverlap(trimmedSuggestion, rightContext.trim())
        const overlapIndex = suggestion.lastIndexOf(overlap)
        if (overlapIndex >= 0) {
            const truncated = suggestion.slice(0, overlapIndex)
            return truncated.trim().length ? truncated : ''
        } else {
            return suggestion
        }
    }

    getInlineCompletionItem(
        document: vscode.TextDocument,
        r: Recommendation,
        start: vscode.Position,
        end: vscode.Position,
        index: number,
        prefix: string
    ): vscode.InlineCompletionItem | undefined {
        if (!r.content.startsWith(prefix)) {
            return undefined
        }
        const truncatedSuggestion = this.truncateOverlapWithRightContext(document, r.content, end)
        if (truncatedSuggestion.length === 0) {
            if (RecommendationHandler.instance.getSuggestionState(index) !== 'Showed') {
                RecommendationHandler.instance.setSuggestionState(index, 'Discard')
            }
            return undefined
        }
        return {
            insertText: truncatedSuggestion,
            range: new vscode.Range(start, end),
            command: {
                command: 'aws.codeWhisperer.accept',
                title: 'On acceptance',
                arguments: [
                    new vscode.Range(start, end),
                    index,
                    truncatedSuggestion,
                    RecommendationHandler.instance.requestId,
                    RecommendationHandler.instance.sessionId,
                    TelemetryHelper.instance.triggerType,
                    TelemetryHelper.instance.completionType,
                    runtimeLanguageContext.getLanguageContext(document.languageId).language,
                    r.references,
                ],
            },
        }
    }

    // the returned completion items will always only contain one valid item
    // this is to trace the current index of visible completion item
    // so that reference tracker can show
    // This hack can be removed once inlineCompletionAdditions API becomes public
    provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        if (position.line < 0 || position.isBefore(RecommendationHandler.instance.startPos)) {
            ReferenceInlineProvider.instance.removeInlineReference()
            ImportAdderProvider.instance.clear()
            this.activeItemIndex = undefined
            return
        }

        // There's a chance that the startPos is no longer valid in the current document (e.g.
        // when CodeWhisperer got triggered by 'Enter', the original startPos is with indentation
        // but then this indentation got removed by VSCode when another new line is inserted,
        // before the code reaches here). In such case, we need to update the startPos to be a
        // valid one. Otherwise, inline completion which utilizes this position will function
        // improperly.
        const start = document.validatePosition(RecommendationHandler.instance.startPos)
        const end = position
        const iteratingIndexes = this.getIteratingIndexes()
        const prefix = document.getText(new vscode.Range(start, end)).replace(/\r\n/g, '\n')
        const matchedCount = RecommendationHandler.instance.recommendations.filter(
            r => r.content.length > 0 && r.content.startsWith(prefix) && r.content !== prefix
        ).length
        for (const i of iteratingIndexes) {
            const r = RecommendationHandler.instance.recommendations[i]
            const item = this.getInlineCompletionItem(document, r, start, end, i, prefix)
            if (item === undefined) {
                continue
            }
            this.activeItemIndex = i
            RecommendationHandler.instance.setSuggestionState(i, 'Showed')
            ReferenceInlineProvider.instance.setInlineReference(
                RecommendationHandler.instance.startPos.line,
                r.content,
                r.references
            )
            ImportAdderProvider.instance.onShowRecommendation(document, RecommendationHandler.instance.startPos.line, r)
            this.nextMove = 0
            TelemetryHelper.instance.setFirstSuggestionShowTime()
            TelemetryHelper.instance.tryRecordClientComponentLatency(document.languageId)
            this._onDidShow.fire()
            if (matchedCount >= 2 || RecommendationHandler.instance.hasNextToken()) {
                const result = [item]
                for (let j = 0; j < matchedCount - 1; j++) {
                    result.push({ insertText: `${item.insertText}${j}`, range: item.range })
                }
                return result
            }
            return [item]
        }
        ReferenceInlineProvider.instance.removeInlineReference()
        ImportAdderProvider.instance.clear()
        this.activeItemIndex = undefined
        return []
    }
}

// below commands override VS Code inline completion commands
const prevCommand = Commands.declare(
    'editor.action.inlineSuggest.showPrevious',
    (service: InlineCompletionService) => async () => {
        await service.showRecommendation(-1)
    }
)
const nextCommand = Commands.declare(
    'editor.action.inlineSuggest.showNext',
    (service: InlineCompletionService) => async () => {
        await service.showRecommendation(1)
    }
)

const rejectCommand = Commands.declare(
    'aws.codeWhisperer.rejectCodeSuggestion',
    (service: InlineCompletionService) => async () => {
        await service.clearInlineCompletionStates(vscode.window.activeTextEditor)
    }
)

export class InlineCompletionService {
    private inlineCompletionProvider?: CWInlineCompletionItemProvider
    private inlineCompletionProviderDisposable?: vscode.Disposable
    private maxPage = 100
    private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
    private _timer?: NodeJS.Timer
    private _showRecommendationTimer?: NodeJS.Timer
    private documentUri: vscode.Uri | undefined = undefined
    private reject: vscode.Disposable
    private next: vscode.Disposable
    private prev: vscode.Disposable
    private _isPaginationRunning = false

    constructor() {
        this.prev = prevCommand.register(this)
        this.next = nextCommand.register(this)
        this.reject = rejectCommand.register(this)
        RecommendationHandler.instance.onDidReceiveRecommendation(e => {
            this.startShowRecommendationTimer()
        })
    }

    static #instance: InlineCompletionService

    public static get instance() {
        return (this.#instance ??= new this())
    }

    filePath(): string | undefined {
        return this.documentUri?.fsPath
    }

    private sharedTryShowRecommendation = shared(this.tryShowRecommendation.bind(this))

    private startShowRecommendationTimer() {
        if (this._showRecommendationTimer) {
            clearInterval(this._showRecommendationTimer)
            this._showRecommendationTimer = undefined
        }
        this._showRecommendationTimer = setInterval(() => {
            const delay = performance.now() - vsCodeState.lastUserModificationTime
            if (delay < CodeWhispererConstants.inlineSuggestionShowDelay) {
                return
            }
            try {
                this.sharedTryShowRecommendation()
            } finally {
                if (this._showRecommendationTimer) {
                    clearInterval(this._showRecommendationTimer)
                    this._showRecommendationTimer = undefined
                }
            }
        }, CodeWhispererConstants.showRecommendationTimerPollPeriod)
    }

    // These commands override the vs code inline completion commands
    // They are subscribed when suggestion starts and disposed when suggestion is accepted/rejected
    // to avoid impacting other plugins or user who uses this API
    private registerCommandOverrides() {
        this.prev = prevCommand.register(this)
        this.next = nextCommand.register(this)
        this.reject = rejectCommand.register(this)
    }

    subscribeSuggestionCommands() {
        this.disposeCommandOverrides()
        this.registerCommandOverrides()
        globals.context.subscriptions.push(this.prev)
        globals.context.subscriptions.push(this.next)
        globals.context.subscriptions.push(this.reject)
    }

    private disposeCommandOverrides() {
        this.prev.dispose()
        this.reject.dispose()
        this.next.dispose()
    }

    public disposeInlineCompletion() {
        this.inlineCompletionProviderDisposable?.dispose()
        this.inlineCompletionProvider = undefined
    }

    async onEditorChange() {
        vsCodeState.isCodeWhispererEditing = false
        ReferenceInlineProvider.instance.removeInlineReference()
        ImportAdderProvider.instance.clear()
        await InlineCompletionService.instance.clearInlineCompletionStates(vscode.window.activeTextEditor)
    }

    async onFocusChange() {
        vsCodeState.isCodeWhispererEditing = false
        ReferenceInlineProvider.instance.removeInlineReference()
        ImportAdderProvider.instance.clear()
        await InlineCompletionService.instance.clearInlineCompletionStates(vscode.window.activeTextEditor)
    }

    async onCursorChange(e: vscode.TextEditorSelectionChangeEvent) {
        // e.kind will be 1 for keyboard cursor change events
        // we do not want to reset the states for keyboard events because they can be typeahead
        if (e.kind !== 1 && vscode.window.activeTextEditor === e.textEditor) {
            ReferenceInlineProvider.instance.removeInlineReference()
            ImportAdderProvider.instance.clear()
            // when cursor change due to mouse movement we need to reset the active item index for inline
            if (e.kind === 2) {
                this.inlineCompletionProvider?.clearActiveItemIndex()
            }
        }
    }

    async clearInlineCompletionStates(editor: vscode.TextEditor | undefined) {
        try {
            vsCodeState.isCodeWhispererEditing = false
            ReferenceInlineProvider.instance.removeInlineReference()
            ImportAdderProvider.instance.clear()
            RecommendationHandler.instance.cancelPaginatedRequest()
            RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
            RecommendationHandler.instance.clearRecommendations()
            this.disposeInlineCompletion()
            vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
            this.disposeCommandOverrides()
            // fix a regression that requires user to hit Esc twice to clear inline ghost text
            // because disposing a provider does not clear the UX
            if (isVscHavingRegressionInlineCompletionApi()) {
                await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
            }
        } finally {
            this.clearRejectionTimer()
        }
    }

    async tryShowRecommendation() {
        const editor = vscode.window.activeTextEditor
        if (editor === undefined) {
            return
        }
        if (this.isSuggestionVisible()) {
            // to force refresh the visual cue so that the total recommendation count can be updated
            const index = this.inlineCompletionProvider?.getActiveItemIndex
            await this.showRecommendation(index ? index : 0, false)
            return
        }
        if (
            editor.selection.active.isBefore(RecommendationHandler.instance.startPos) ||
            editor.document.uri.fsPath !== this.documentUri?.fsPath
        ) {
            RecommendationHandler.instance.cancelPaginatedRequest()
            RecommendationHandler.instance.recommendations.forEach((r, i) => {
                RecommendationHandler.instance.setSuggestionState(i, 'Discard')
            })
            RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
            RecommendationHandler.instance.clearRecommendations()
        } else if (RecommendationHandler.instance.recommendations.length > 0) {
            this.subscribeSuggestionCommands()
            await this.startRejectionTimer(editor)
            await this.showRecommendation(0, true)
        }
    }

    async getPaginatedRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        if (vsCodeState.isCodeWhispererEditing || this._isPaginationRunning || this.isSuggestionVisible()) {
            return
        }
        if (ClassifierTrigger.instance.shouldInvokeClassifier(editor.document.languageId)) {
            ClassifierTrigger.instance.recordClassifierResultForAutoTrigger(editor, autoTriggerType, event)
        }
        const triggerChar = event?.contentChanges[0]?.text
        if (autoTriggerType === 'SpecialCharacters' && triggerChar) {
            TelemetryHelper.instance.setTriggerCharForUserTriggerDecision(triggerChar)
        }
        const isAutoTrigger = triggerType === 'AutoTrigger'
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.notifyReauthenticate(isAutoTrigger)
            return
        }
        TelemetryHelper.instance.setInvocationStartTime(performance.now())
        await this.clearInlineCompletionStates(editor)
        this.setCodeWhispererStatusBarLoading()
        RecommendationHandler.instance.checkAndResetCancellationTokens()
        this.documentUri = editor.document.uri
        try {
            let page = 0
            while (page < this.maxPage) {
                await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    triggerType,
                    config,
                    autoTriggerType,
                    true,
                    page
                )
                if (RecommendationHandler.instance.checkAndResetCancellationTokens()) {
                    RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
                    RecommendationHandler.instance.clearRecommendations()
                    vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
                    TelemetryHelper.instance.setIsRequestCancelled(true)
                    return
                }
                if (!RecommendationHandler.instance.hasNextToken()) {
                    break
                }
                page++
            }
            TelemetryHelper.instance.setNumberOfRequestsInSession(page + 1)
        } catch (error) {
            getLogger().error(`Error ${error} in getPaginatedRecommendation`)
        }
        vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
        if (triggerType === 'OnDemand' && RecommendationHandler.instance.recommendations.length === 0) {
            if (RecommendationHandler.instance.errorMessagePrompt !== '') {
                showTimedMessage(RecommendationHandler.instance.errorMessagePrompt, 2000)
            } else {
                showTimedMessage(CodeWhispererConstants.noSuggestions, 2000)
            }
        }
        TelemetryHelper.instance.tryRecordClientComponentLatency(editor.document.languageId)
    }

    async showRecommendation(indexShift: number, noSuggestionVisible: boolean = false) {
        await lock.acquire(updateInlineLockKey, async () => {
            const inlineCompletionProvider = new CWInlineCompletionItemProvider(
                this.inlineCompletionProvider?.getActiveItemIndex,
                indexShift
            )
            this.inlineCompletionProviderDisposable?.dispose()
            // when suggestion is active, registering a new provider will let VS Code invoke inline API automatically
            this.inlineCompletionProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
                Object.assign([], CodeWhispererConstants.supportedLanguages),
                inlineCompletionProvider
            )
            this.inlineCompletionProvider = inlineCompletionProvider

            if (isVscHavingRegressionInlineCompletionApi() && !noSuggestionVisible) {
                // fix a regression in new VS Code when disposing and re-registering
                // a new provider does not auto refresh the inline suggestion widget
                // by manually refresh it
                await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
                await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
            }
            if (noSuggestionVisible) {
                await vscode.commands.executeCommand(`editor.action.inlineSuggest.trigger`)
                this.sendPerceivedLatencyTelemetry()
            }
        })
    }

    private sendPerceivedLatencyTelemetry() {
        if (vscode.window.activeTextEditor) {
            const languageContext = runtimeLanguageContext.getLanguageContext(
                vscode.window.activeTextEditor.document.languageId
            )
            telemetry.codewhisperer_perceivedLatency.emit({
                codewhispererRequestId: RecommendationHandler.instance.requestId,
                codewhispererSessionId: RecommendationHandler.instance.sessionId,
                codewhispererTriggerType: TelemetryHelper.instance.triggerType,
                codewhispererCompletionType: TelemetryHelper.instance.completionType,
                codewhispererLanguage: languageContext.language,
                duration: performance.now() - RecommendationHandler.instance.lastInvocationTime,
                passive: true,
                credentialStartUrl: TelemetryHelper.instance.startUrl,
                codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
            })
        }
    }

    setCodeWhispererStatusBarLoading() {
        this._isPaginationRunning = true
        this.statusBar.text = ` $(loading~spin)CodeWhisperer`
        this.statusBar.command = undefined
        ;(this.statusBar as any).backgroundColor = undefined
        this.statusBar.show()
    }

    setCodeWhispererStatusBarOk() {
        this._isPaginationRunning = false
        this.statusBar.text = ` $(check)CodeWhisperer`
        this.statusBar.command = undefined
        ;(this.statusBar as any).backgroundColor = undefined
        this.statusBar.show()
    }

    setCodeWhispererStatusBarDisconnected() {
        this._isPaginationRunning = false
        this.statusBar.text = ` $(debug-disconnect)CodeWhisperer`
        this.statusBar.command = 'aws.codeWhisperer.reconnect'
        ;(this.statusBar as any).backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        this.statusBar.show()
    }

    isPaginationRunning(): boolean {
        return this._isPaginationRunning
    }

    hideCodeWhispererStatusBar() {
        this._isPaginationRunning = false
        this.statusBar.hide()
    }

    isSuggestionVisible(): boolean {
        return this.inlineCompletionProvider?.getActiveItemIndex !== undefined
    }

    private clearRejectionTimer() {
        if (this._timer !== undefined) {
            clearInterval(this._timer)
            this._timer = undefined
        }
    }

    /*
     * This startRejectionTimer function is to mark recommendation as rejected
     * when the suggestions are no longer been shown to users for more than 5 seconds
     */
    private async startRejectionTimer(editor: vscode.TextEditor): Promise<void> {
        if (this._timer !== undefined) {
            return
        }
        this._timer = globals.clock.setInterval(async () => {
            if (!this.isSuggestionVisible()) {
                getLogger().verbose(`Clearing cached suggestion`)
                await this.clearInlineCompletionStates(editor)
            }
        }, 5 * 1000)
    }
}
