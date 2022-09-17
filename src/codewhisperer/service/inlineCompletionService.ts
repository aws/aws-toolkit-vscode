/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ConfigurationEntry, vsCodeState } from '../models/model'
import * as CodeWhispererConstants from '../models/constants'
import { ReferenceInlineProvider } from './referenceInlineProvider'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
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
import { HoverConfigUtil } from '../util/hoverConfigUtil'
import globals from '../../shared/extensionGlobals'

class CodeWhispererInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private activeItemIndex: number | undefined
    public nextMove: number
    private referenceInlineProvider?: ReferenceInlineProvider

    private _onDidShow: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidShow: vscode.Event<void> = this._onDidShow.event

    public constructor(
        itemIndex: number | undefined,
        firstMove: number,
        referenceInlineProvider?: ReferenceInlineProvider
    ) {
        this.activeItemIndex = itemIndex
        this.nextMove = firstMove
        this.referenceInlineProvider = referenceInlineProvider
    }

    get getActiveItemIndex() {
        return this.activeItemIndex
    }

    private getGhostText(prefix: string, suggestion: string): string {
        const prefixLines = prefix.split(/\r\n|\r|\n/)
        const n = prefixLines.length
        if (n <= 1) return suggestion
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
            this.referenceInlineProvider?.removeInlineReference()
            this.activeItemIndex = undefined
            return
        }
        const start = RecommendationHandler.instance.startPos
        const end = position
        const prefix = document.getText(new vscode.Range(start, end)).replace(/\r\n/g, '\n')
        const items: vscode.InlineCompletionItem[] = []
        const iteratingIndexes = this.getIteratingIndexes()
        for (const i of iteratingIndexes) {
            const r = RecommendationHandler.instance.recommendations[i]
            if (r.content.startsWith(prefix)) {
                this.activeItemIndex = i
                items.push({
                    insertText: this.getGhostText(prefix, r.content),
                    range: new vscode.Range(this.getGhostTextStartPos(start, end), end),
                    command: {
                        command: 'aws.codeWhisperer.accept',
                        title: 'On acceptance',
                        arguments: [
                            new vscode.Range(start, end),
                            i,
                            r.content,
                            RecommendationHandler.instance.requestId,
                            RecommendationHandler.instance.sessionId,
                            TelemetryHelper.instance.triggerType,
                            TelemetryHelper.instance.completionType,
                            runtimeLanguageContext.getLanguageContext(document.languageId).language,
                            r.references,
                        ],
                    },
                })
                RecommendationHandler.instance.setSuggestionState(i, 'Showed')
                this.referenceInlineProvider?.setInlineReference(
                    RecommendationHandler.instance.startPos.line,
                    r.content,
                    r.references
                )
                this.nextMove = 0
                this._onDidShow.fire()
                return [items[0]]
            }
        }
        this.referenceInlineProvider?.removeInlineReference()
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
    private referenceProvider?: ReferenceInlineProvider
    private inlineCompletionProvider?: CodeWhispererInlineCompletionItemProvider
    private inlineCompletionProviderDisposable?: vscode.Disposable
    private maxPage = 100
    private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
    private _timer?: NodeJS.Timer
    private documentUri: vscode.Uri | undefined = undefined
    private hide: vscode.Disposable
    private next: vscode.Disposable
    private prev: vscode.Disposable

    constructor() {
        this.prev = prevCommand.register(this)
        this.next = nextCommand.register(this)
        this.hide = hideCommand.register(this)
    }

    static #instance: InlineCompletionService

    public static get instance() {
        return (this.#instance ??= new this())
    }

    // These commands override the vs code inline completion commands
    // They are subscribed when suggestion starts and disposed when suggestion is accepted/rejected
    // to avoid impacting other plugins or user who uses this API
    private registerCommandOverrides() {
        this.prev = prevCommand.register(this)
        this.next = nextCommand.register(this)
        this.hide = hideCommand.register(this)
    }

    subscribeCommands() {
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
        this.referenceProvider?.removeInlineReference()
    }

    async onFocusChange() {
        vsCodeState.isCodeWhispererEditing = false
        this.referenceProvider?.removeInlineReference()
    }

    async onCursorChange(e: vscode.TextEditorSelectionChangeEvent) {
        if (e.kind !== 1 && vscode.window.activeTextEditor === e.textEditor) {
            this.referenceProvider?.removeInlineReference()
        }
    }

    async clearInlineCompletionStates(editor: vscode.TextEditor | undefined) {
        await HoverConfigUtil.instance.restoreHoverConfig()
        vsCodeState.isCodeWhispererEditing = false
        this.referenceProvider?.removeInlineReference()
        RecommendationHandler.instance.cancelPaginatedRequest()
        RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(editor, -1)
        RecommendationHandler.instance.clearRecommendations()
        this.disposeInlineCompletion()
        this.setCodeWhispererStatusBarOk()
        this.disposeCommandOverrides()
        this.clearRejectionTimer()
    }

    setReferenceInlineProvider(provider: ReferenceInlineProvider) {
        this.referenceProvider = provider
    }

    async getPaginatedRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType
    ) {
        if (vsCodeState.isCodeWhispererEditing || this.isPaginationRunning()) return
        await this.clearInlineCompletionStates(editor)
        this.setCodeWhispererStatusBarLoading()
        await HoverConfigUtil.instance.overwriteHoverConfig()
        this.subscribeCommands()
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
                    RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(editor, -1)
                    RecommendationHandler.instance.clearRecommendations()
                    this.setCodeWhispererStatusBarOk()
                    return
                }

                if (!this.isSuggestionVisible()) {
                    if (
                        editor.selection.active.isBefore(RecommendationHandler.instance.startPos) ||
                        editor.document.uri.fsPath !== this.documentUri?.fsPath
                    ) {
                        RecommendationHandler.instance.cancelPaginatedRequest()
                        RecommendationHandler.instance.recommendations.forEach((r, i) => {
                            RecommendationHandler.instance.setSuggestionState(i, 'Discard')
                        })
                        RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(editor, -1)
                        RecommendationHandler.instance.clearRecommendations()
                    } else if (RecommendationHandler.instance.recommendations.length > 0) {
                        RecommendationHandler.instance.moveStartPositionToSkipSpaces(editor)
                        this.startRejectionTimer(editor)
                        await this.showRecommendation(0, true)
                    }
                }

                if (!RecommendationHandler.instance.hasNextToken()) break
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
        if (RecommendationHandler.instance.recommendations.length === 0) {
            await HoverConfigUtil.instance.restoreHoverConfig()
        }
    }

    async showRecommendation(indexShift: number, isFirstRecommendation: boolean = false) {
        this.inlineCompletionProvider = new CodeWhispererInlineCompletionItemProvider(
            this.inlineCompletionProvider?.getActiveItemIndex,
            indexShift,
            this.referenceProvider
        )
        this.inlineCompletionProvider.onDidShow(e => {
            this._timer?.refresh()
        })
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
                })
            }
        }
    }

    setCodeWhispererStatusBarLoading() {
        this.statusBar.text = ` $(loading~spin)CodeWhisperer`
        this.statusBar.show()
    }

    setCodeWhispererStatusBarOk() {
        this.statusBar.text = ` $(check)CodeWhisperer`
        this.statusBar.show()
    }

    hideCodeWhispererStatusBar() {
        this.statusBar.hide()
    }

    isSuggestionVisible(): boolean {
        return this.inlineCompletionProvider?.getActiveItemIndex !== undefined
    }

    isPaginationRunning() {
        return this.statusBar.text === ` $(loading~spin)CodeWhisperer`
    }

    private clearRejectionTimer() {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
    }

    /*
     * This startRejectionTimer function is to mark recommendation as rejected
     * when the suggestions are no longer been shown to users for more than 10 seconds
     */
    private async startRejectionTimer(editor: vscode.TextEditor): Promise<void> {
        if (this._timer !== undefined) {
            return
        }
        this._timer = globals.clock.setTimeout(async () => {
            if (!this.isSuggestionVisible()) {
                getLogger().info(`Clearing cached suggestion`)
                await this.clearInlineCompletionStates(editor)
            }
        }, 10 * 1000)
    }
}
