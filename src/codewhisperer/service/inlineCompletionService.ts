/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { getPrefixSuffixOverlap } from '../util/commonUtil'
import globals from '../../shared/extensionGlobals'
import { AuthUtil } from '../util/authUtil'

class CWInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
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

    private getGhostText(prefix: string, suggestion: string): string {
        const prefixLines = prefix.split(/\r\n|\r|\n/)
        const n = prefixLines.length
        if (n <= 1) {
            return suggestion
        }
        let count = 1
        for (let i = 0; i < suggestion.length; i++) {
            if (suggestion[i] === '\n') {
                count++
            }
            if (count === n) {
                return suggestion.slice(i + 1)
            }
        }
        return ''
    }

    private getGhostTextStartPos(start: vscode.Position, current: vscode.Position): vscode.Position {
        if (start.line === current.line) {
            return start
        }
        return new vscode.Position(current.line, 0)
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

    truncateOverlapWithRightContext(document: vscode.TextDocument, suggestion: string): string {
        let rightContextRange: vscode.Range | undefined = undefined
        const pos = RecommendationHandler.instance.startPos
        if (suggestion.split(/\r?\n/).length > 1) {
            rightContextRange = new vscode.Range(pos, document.positionAt(document.offsetAt(pos) + suggestion.length))
        } else {
            rightContextRange = new vscode.Range(pos, document.lineAt(pos).range.end)
        }
        const rightContext = document.getText(rightContextRange)
        const overlap = getPrefixSuffixOverlap(suggestion, rightContext)
        return suggestion.slice(0, suggestion.length - overlap.length)
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
        const truncatedSuggestion = this.truncateOverlapWithRightContext(document, r.content)
        if (truncatedSuggestion.length === 0) {
            if (RecommendationHandler.instance.getSuggestionState(index) !== 'Showed') {
                RecommendationHandler.instance.setSuggestionState(index, 'Discard')
            }
            return undefined
        }
        return {
            insertText: this.getGhostText(prefix, truncatedSuggestion),
            range: new vscode.Range(this.getGhostTextStartPos(start, end), end),
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
            this.activeItemIndex = undefined
            return
        }
        const start = RecommendationHandler.instance.startPos
        const end = position
        const iteratingIndexes = this.getIteratingIndexes()
        const prefix = document.getText(new vscode.Range(start, end)).replace(/\r\n/g, '\n')
        const matchedCount = RecommendationHandler.instance.recommendations.filter(
            r => r.content.length > 0 && r.content.startsWith(prefix)
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
            this.nextMove = 0
            TelemetryHelper.instance.setFirstSuggestionShowTime()
            TelemetryHelper.instance.tryRecordClientComponentLatency(document.languageId)
            this._onDidShow.fire()
            if (matchedCount >= 2 || RecommendationHandler.instance.hasNextToken()) {
                return [item, { insertText: 'x' }]
            }
            return [item]
        }
        ReferenceInlineProvider.instance.removeInlineReference()
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

const hideCommand = Commands.declare(
    'editor.action.inlineSuggest.hide',
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
    private documentUri: vscode.Uri | undefined = undefined
    private hide: vscode.Disposable
    private next: vscode.Disposable
    private prev: vscode.Disposable
    private _isPaginationRunning = false

    constructor() {
        this.prev = prevCommand.register(this)
        this.next = nextCommand.register(this)
        this.hide = hideCommand.register(this)
        RecommendationHandler.instance.onDidReceiveRecommendation(e => {
            this.tryShowRecommendation()
        })
    }

    static #instance: InlineCompletionService

    public static get instance() {
        return (this.#instance ??= new this())
    }

    filePath(): string | undefined {
        return this.documentUri?.fsPath
    }

    // These commands override the vs code inline completion commands
    // They are subscribed when suggestion starts and disposed when suggestion is accepted/rejected
    // to avoid impacting other plugins or user who uses this API
    private registerCommandOverrides() {
        this.prev = prevCommand.register(this)
        this.next = nextCommand.register(this)
        this.hide = hideCommand.register(this)
    }

    subscribeSuggestionCommands() {
        this.disposeCommandOverrides()
        this.registerCommandOverrides()
        globals.context.subscriptions.push(this.prev)
        globals.context.subscriptions.push(this.next)
        globals.context.subscriptions.push(this.hide)
    }

    private disposeCommandOverrides() {
        this.prev.dispose()
        this.hide.dispose()
        this.next.dispose()
    }

    public disposeInlineCompletion() {
        this.inlineCompletionProviderDisposable?.dispose()
        this.inlineCompletionProvider = undefined
    }

    async onEditorChange() {
        vsCodeState.isCodeWhispererEditing = false
        ReferenceInlineProvider.instance.removeInlineReference()
    }

    async onFocusChange() {
        vsCodeState.isCodeWhispererEditing = false
        ReferenceInlineProvider.instance.removeInlineReference()
    }

    async onCursorChange(e: vscode.TextEditorSelectionChangeEvent) {
        if (e.kind !== 1 && vscode.window.activeTextEditor === e.textEditor) {
            ReferenceInlineProvider.instance.removeInlineReference()
        }
    }

    async clearInlineCompletionStates(editor: vscode.TextEditor | undefined) {
        try {
            vsCodeState.isCodeWhispererEditing = false
            ReferenceInlineProvider.instance.removeInlineReference()
            RecommendationHandler.instance.cancelPaginatedRequest()
            RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
            RecommendationHandler.instance.clearRecommendations()
            this.disposeInlineCompletion()
            this.setCodeWhispererStatusBarOk()
            this.disposeCommandOverrides()
        } finally {
            this.clearRejectionTimer()
        }
    }

    async tryShowRecommendation() {
        const editor = vscode.window.activeTextEditor
        if (this.isSuggestionVisible() || editor === undefined) {
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
            RecommendationHandler.instance.moveStartPositionToSkipSpaces(editor)
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
        autoTriggerType?: CodewhispererAutomatedTriggerType
    ) {
        if (vsCodeState.isCodeWhispererEditing || this._isPaginationRunning) {
            return
        }
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
                    this.setCodeWhispererStatusBarOk()
                    return
                }
                if (!RecommendationHandler.instance.hasNextToken()) {
                    break
                }
                page++
            }
        } catch (error) {
            getLogger().error(`Error ${error} in getPaginatedRecommendation`)
        }
        this.setCodeWhispererStatusBarOk()
        if (triggerType === 'OnDemand' && RecommendationHandler.instance.recommendations.length === 0) {
            if (RecommendationHandler.instance.errorMessagePrompt !== '') {
                showTimedMessage(RecommendationHandler.instance.errorMessagePrompt, 2000)
            } else {
                showTimedMessage(CodeWhispererConstants.noSuggestions, 2000)
            }
        }
        TelemetryHelper.instance.tryRecordClientComponentLatency(editor.document.languageId)
    }

    async showRecommendation(indexShift: number, isFirstRecommendation: boolean = false) {
        if (vscode.window.activeTextEditor) {
            vscode.window.showTextDocument(vscode.window.activeTextEditor.document)
        }
        this.inlineCompletionProvider = new CWInlineCompletionItemProvider(
            this.inlineCompletionProvider?.getActiveItemIndex,
            indexShift
        )
        this.inlineCompletionProviderDisposable?.dispose()
        // when suggestion is active, registering a new provider will let VS Code invoke inline API automatically
        this.inlineCompletionProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
            Object.assign([], CodeWhispererConstants.supportedLanguages),
            this.inlineCompletionProvider
        )
        if (isFirstRecommendation) {
            await vscode.commands.executeCommand(`editor.action.inlineSuggest.trigger`)
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
                })
            }
        }
    }

    setCodeWhispererStatusBarLoading() {
        this._isPaginationRunning = true
        this.statusBar.text = ` $(loading~spin)CodeWhisperer`
        this.statusBar.show()
    }

    setCodeWhispererStatusBarOk() {
        this._isPaginationRunning = false
        this.statusBar.text = ` $(check)CodeWhisperer`
        this.statusBar.show()
    }

    isPaginationRunning(): boolean {
        return this._isPaginationRunning
    }

    hideCodeWhispererStatusBar() {
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

export const refreshStatusBar = Commands.declare('aws.codeWhisperer.refreshStatusBar', () => () => {
    if (!AuthUtil.instance.isConnectionValid()) {
        InlineCompletionService.instance.hideCodeWhispererStatusBar()
    } else {
        InlineCompletionService.instance.setCodeWhispererStatusBarOk()
    }
})
