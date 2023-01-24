/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConfigurationEntry, vsCodeState } from '../models/model'
import * as CodeWhispererConstants from '../models/constants'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { TelemetryHelper } from '../util/telemetryHelper'
import { ReferenceInlineProvider } from './referenceInlineProvider'
import { DefaultCodeWhispererClient, Recommendation } from '../client/codewhisperer'
import { RecommendationHandler } from './recommendationHandler'
import { showTimedMessage } from '../../shared/utilities/messages'
import { getLogger } from '../../shared/logger/logger'
import globals from '../../shared/extensionGlobals'
import {
    telemetry,
    CodewhispererAutomatedTriggerType,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry'

const performance = globalThis.performance ?? require('perf_hooks').performance

interface InlineCompletionItem {
    content: string
    index: number
}

/**
 * This class is for TextEditor.edit based inline completion
 */
export class InlineCompletion {
    private _range!: vscode.Range
    private dimDecoration = vscode.window.createTextEditorDecorationType(<vscode.DecorationRenderOptions>{
        textDecoration: `none; opacity: ${50 / 100}`,
        light: {
            color: '#013220',
        },
        dark: {
            color: '#DDDDDD',
        },
    })
    private _maxPage = 100
    private _pollPeriod = 25
    public items: InlineCompletionItem[]
    public origin: Recommendation[]
    public position: number
    private typeAhead: string
    private codewhispererStatusBar: vscode.StatusBarItem
    public isTypeaheadInProgress: boolean
    private _timer?: NodeJS.Timer
    private documentUri: vscode.Uri | undefined
    /**
     * Set whenever a document has active inline recommendations
     */
    private isInlineActive = false

    constructor() {
        this.items = []
        this.origin = []
        this.position = 0
        this.typeAhead = ''
        this.codewhispererStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
        this.isTypeaheadInProgress = false
        this.documentUri = undefined
    }

    static #instance: InlineCompletion

    public static get instance() {
        return (this.#instance ??= new this())
    }

    async resetInlineStates(editor: vscode.TextEditor) {
        this.items = []
        this.origin = []
        this.position = 0
        this.typeAhead = ''
        await vscode.commands.executeCommand('setContext', CodeWhispererConstants.serviceActiveKey, false)
        this.isInlineActive = false
        editor.setDecorations(this.dimDecoration, [])
        this.setCodeWhispererStatusBarOk()
        this.documentUri = vscode.Uri.file('')
    }

    setRange(range: vscode.Range) {
        this._range = range
    }

    getCompletionItems() {
        const completionItems: Recommendation[] = []
        RecommendationHandler.instance.recommendations.forEach(r => {
            if (r.content.length > 0) {
                completionItems.push(r)
            }
        })
        return completionItems
    }

    async acceptRecommendation(editor: vscode.TextEditor) {
        if (vsCodeState.isCodeWhispererEditing) {
            return
        }
        vsCodeState.isCodeWhispererEditing = true
        await editor
            ?.edit(
                builder => {
                    builder.replace(this._range, this.items[this.position].content)
                },
                { undoStopAfter: false, undoStopBefore: false }
            )
            .then(async () => {
                const languageContext = runtimeLanguageContext.getLanguageContext(editor.document.languageId)
                const index = this.items[this.position].index
                const acceptArguments = [
                    this._range,
                    this.position,
                    this.origin[index].content,
                    RecommendationHandler.instance.requestId,
                    RecommendationHandler.instance.sessionId,
                    TelemetryHelper.instance.triggerType,
                    TelemetryHelper.instance.completionType,
                    languageContext.language,
                    this.origin[index].references,
                ] as const
                vsCodeState.isCodeWhispererEditing = false
                ReferenceInlineProvider.instance.removeInlineReference()
                await vscode.commands.executeCommand('aws.codeWhisperer.accept', ...acceptArguments)
                await this.resetInlineStates(editor)
            })
    }
    async resetRejectStates(editor: vscode.TextEditor) {
        vsCodeState.isCodeWhispererEditing = false
        await this.resetInlineStates(editor)

        RecommendationHandler.instance.cancelPaginatedRequest()
        // report all recommendation as rejected
        RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
    }

    async rejectRecommendation(
        editor: vscode.TextEditor | undefined,
        isTypeAheadRejection: boolean = false,
        onDidChangeVisibleTextEditors: boolean = false
    ) {
        if (!editor || vsCodeState.isCodeWhispererEditing) {
            return
        }
        if (!isTypeAheadRejection && this.items.length === 0) {
            return
        }
        vsCodeState.isCodeWhispererEditing = true
        ReferenceInlineProvider.instance.removeInlineReference()
        if (onDidChangeVisibleTextEditors && this.documentUri && this.documentUri.fsPath.length > 0) {
            const workEdits = new vscode.WorkspaceEdit()
            workEdits.set(this.documentUri, [vscode.TextEdit.delete(this._range)])
            try {
                await vscode.workspace.applyEdit(workEdits)
            } finally {
                await this.resetRejectStates(editor)
            }
        } else {
            await editor
                ?.edit(
                    builder => {
                        builder.delete(this._range)
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
                .then(async () => {
                    await this.resetRejectStates(editor)
                })
        }
    }
    // get the typeahead since user invocation position
    // ignore leading white spaces and TAB
    getTypedPrefix(editor: vscode.TextEditor): string {
        const typedPrefix = editor.document.getText(
            new vscode.Range(
                RecommendationHandler.instance.startPos.line,
                RecommendationHandler.instance.startPos.character,
                editor.selection.active.line,
                editor.selection.active.character
            )
        )
        let move = 0
        // when inline is not active, user input space and \t won't be considered as typeahead
        if (!this.isInlineActive) {
            for (let i = 0; i < typedPrefix.length; i++) {
                if (typedPrefix[i] === ' ' || typedPrefix[i] === '\t') {
                    move++
                } else {
                    break
                }
            }
            RecommendationHandler.instance.startPos = new vscode.Position(
                RecommendationHandler.instance.startPos.line,
                RecommendationHandler.instance.startPos.character + move
            )
        }

        return typedPrefix.substring(move).replace(/\r\n/g, '\n')
    }

    async setTypeAheadRecommendations(editor: vscode.TextEditor | undefined, event: vscode.TextDocumentChangeEvent) {
        if (!editor || this.origin.length === 0) {
            this.isTypeaheadInProgress = false
            return
        }
        // run typeahead logic only when user typed something after the invocation start position
        if (editor.selection.active.isAfter(RecommendationHandler.instance.startPos)) {
            const typedPrefix = this.getTypedPrefix(editor)
            this.items = []
            this.origin.forEach((item, index) => {
                if (item.content.startsWith(typedPrefix)) {
                    this.items.push({ content: item.content.substring(typedPrefix.length), index: index })
                }
            })
            const currentPosition = new vscode.Position(editor.selection.active.line, editor.selection.active.character)
            let endPosition = new vscode.Position(this._range.end.line, this._range.end.character + 1)
            // if user input a newline, end line number of recommendation will change.
            const textChange = event.contentChanges[0].text
            if (
                textChange.startsWith(CodeWhispererConstants.lineBreak) ||
                textChange.startsWith(CodeWhispererConstants.lineBreakWin)
            ) {
                endPosition = new vscode.Position(this._range.end.line + 1, this._range.end.character + 1)
            }
            this.setRange(new vscode.Range(currentPosition, endPosition))
            if (this.items.length) {
                this.isTypeaheadInProgress = true
                this.position = 0
                this.typeAhead = typedPrefix
                await this.showRecommendation(editor)
            } else {
                this.isTypeaheadInProgress = false
                await this.rejectRecommendation(editor, true)
            }
        }
    }

    async showRecommendation(editor: vscode.TextEditor) {
        vsCodeState.isCodeWhispererEditing = true
        await editor
            ?.edit(
                builder => {
                    builder.delete(this._range)
                },
                { undoStopAfter: false, undoStopBefore: false }
            )
            .then(async () => {
                if (this.items?.length > 0) {
                    await editor
                        ?.edit(
                            builder => {
                                builder.insert(this._range.start, this.items[this.position].content)
                            },
                            { undoStopAfter: false, undoStopBefore: false }
                        )
                        .then(async () => {
                            const pos = new vscode.Position(
                                editor.selection.active.line,
                                editor.selection.active.character + 1
                            )
                            /*
                             * When typeAhead is involved we set the position of character with one more character to net let
                             * last bracket of recommendation to be removed
                             */
                            if (this.isTypeaheadInProgress) {
                                this.setRange(new vscode.Range(this._range.start, pos))
                            } else {
                                this.setRange(new vscode.Range(this._range.start, editor.selection.active))
                            }
                            editor.setDecorations(this.dimDecoration, [this._range])
                            // cursor position
                            const position = editor.selection.active
                            const newPosition = position.with(this._range.start.line, this._range.start.character)
                            // set Position
                            const newSelection = new vscode.Selection(newPosition, newPosition)
                            editor.selection = newSelection

                            await vscode.commands.executeCommand(
                                'setContext',
                                CodeWhispererConstants.serviceActiveKey,
                                true
                            )
                            this.isInlineActive = true
                            const curItem = this.items[this.position]
                            ReferenceInlineProvider.instance.setInlineReference(
                                RecommendationHandler.instance.startPos.line,
                                curItem.content,
                                this.origin[curItem.index].references
                            )
                            RecommendationHandler.instance.setSuggestionState(curItem.index, 'Showed')
                        })
                }
            })
        vsCodeState.isCodeWhispererEditing = false
    }

    async navigateRecommendation(editor: vscode.TextEditor, next: boolean) {
        if (!this.items?.length || this.items.length === 1 || vsCodeState.isCodeWhispererEditing || !editor) {
            return
        }
        vsCodeState.isCodeWhispererEditing = true
        if (next) {
            if (this.position === this.items.length - 1) {
                vsCodeState.isCodeWhispererEditing = false
                return
            }
            this.position = Math.min(this.position + 1, this.items.length)
        } else {
            this.position = this.position - 1
            if (this.position < 0) {
                this.position = 0
                vsCodeState.isCodeWhispererEditing = false
                return
            }
        }
        this.setRange(new vscode.Range(editor.selection.active, this._range.end))
        await this.showRecommendation(editor)
    }

    async getPaginatedRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType
    ) {
        RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
        RecommendationHandler.instance.clearRecommendations()
        this.setCodeWhispererStatusBarLoading()
        const isManualTrigger = triggerType === 'OnDemand'
        this.startShowRecommendationTimer(
            isManualTrigger,
            CodeWhispererConstants.suggestionShowDelay,
            this._pollPeriod,
            editor
        )
        let page = 0
        RecommendationHandler.instance.checkAndResetCancellationTokens()
        this.documentUri = editor.document.uri
        try {
            while (page < this._maxPage) {
                await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    triggerType,
                    config,
                    autoTriggerType,
                    true,
                    page
                )
                this.setCompletionItems(editor)
                if (RecommendationHandler.instance.checkAndResetCancellationTokens()) {
                    RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
                    RecommendationHandler.instance.clearRecommendations()
                    break
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
    }
    /*
     * This startShowRecommendationTimer function is to enforce CodeWhisperer to only show recommendation
     * after a delay since user last keystroke input
     */
    private async startShowRecommendationTimer(
        isManualTrigger: boolean,
        showSuggestionDelay: number,
        pollPeriod: number,
        editor: vscode.TextEditor
    ): Promise<void> {
        if (this._timer !== undefined) {
            return
        }
        this._timer = globals.clock.setTimeout(async () => {
            const delay = performance.now() - vsCodeState.lastUserModificationTime
            if (delay < showSuggestionDelay) {
                this._timer?.refresh()
            } else {
                // do not show recommendation if cursor is before invocation position or user opened another document
                // mark suggestions as Discard and cancel paginated request
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
                    if (this._timer !== undefined) {
                        clearTimeout(this._timer)
                        this._timer = undefined
                    }
                    return
                }
                this.setCompletionItems(editor)
                if (this.items.length > 0) {
                    this.setRange(new vscode.Range(editor.selection.active, editor.selection.active))
                    try {
                        await this.showRecommendation(editor)
                        const languageContext = runtimeLanguageContext.getLanguageContext(editor.document.languageId)
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
                    } catch (error) {
                        getLogger().error(`Failed to show suggestion ${error}`)
                        RecommendationHandler.instance.cancelPaginatedRequest()
                        RecommendationHandler.instance.recommendations.forEach((r, i) => {
                            RecommendationHandler.instance.setSuggestionState(i, 'Discard')
                        })
                        RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
                        RecommendationHandler.instance.clearRecommendations()
                    }
                    if (this._timer !== undefined) {
                        clearTimeout(this._timer)
                        this._timer = undefined
                    }
                } else {
                    if (this.isPaginationRunning()) {
                        this._timer?.refresh()
                    } else {
                        if (this._timer !== undefined) {
                            clearTimeout(this._timer)
                            this._timer = undefined
                            if (isManualTrigger && RecommendationHandler.instance.recommendations.length === 0) {
                                if (RecommendationHandler.instance.errorMessagePrompt !== '') {
                                    showTimedMessage(RecommendationHandler.instance.errorMessagePrompt, 2000)
                                } else {
                                    showTimedMessage(CodeWhispererConstants.noSuggestions, 2000)
                                }
                            }
                            RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
                            RecommendationHandler.instance.clearRecommendations()
                        }
                    }
                }
            }
        }, pollPeriod)
    }

    private setCompletionItems(editor: vscode.TextEditor) {
        vsCodeState.isCodeWhispererEditing = true
        this.origin = this.getCompletionItems()
        this.typeAhead = this.getTypedPrefix(editor)
        this.setCompletionItemsUnderTypeAhead()
        vsCodeState.isCodeWhispererEditing = false
    }

    private setCompletionItemsUnderTypeAhead() {
        this.items = []
        if (this.typeAhead.length > 0) {
            this.origin.forEach((item, index) => {
                if (
                    item.content.startsWith(this.typeAhead) &&
                    RecommendationHandler.instance.getSuggestionState(index) !== 'Filtered'
                ) {
                    this.items.push({
                        content: item.content.substring(this.typeAhead.length),
                        index: index,
                    })
                }
            })
        } else {
            this.origin.forEach((item, index) => {
                if (RecommendationHandler.instance.getSuggestionState(index) !== 'Filtered') {
                    this.items.push({
                        content: item.content,
                        index: index,
                    })
                }
            })
        }
    }

    setCodeWhispererStatusBarLoading() {
        this.codewhispererStatusBar.text = ` $(loading~spin)CodeWhisperer`
        this.codewhispererStatusBar.show()
    }

    setCodeWhispererStatusBarOk() {
        this.codewhispererStatusBar.text = ` $(check)CodeWhisperer`
        this.codewhispererStatusBar.show()
    }

    hideCodeWhispererStatusBar() {
        this.codewhispererStatusBar.hide()
    }

    isPaginationRunning() {
        return this.codewhispererStatusBar.text === ` $(loading~spin)CodeWhisperer`
    }

    get getIsActive() {
        return this.isInlineActive
    }
}
