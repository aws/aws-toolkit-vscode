/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConfigurationEntry, vsCodeState } from '../models/model'
import { ConsolasConstants } from '../models/constants'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { TelemetryHelper } from '../util/telemetryHelper'
import { ReferenceInlineProvider } from './referenceInlineProvider'
import { DefaultConsolasClient, RecommendationDetail } from '../client/consolas'
import { RecommendationHandler } from './recommendationHandler'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { showTimedMessage } from '../../../shared/utilities/messages'
import { getLogger } from '../../../shared/logger/logger'
import globals from '../../../shared/extensionGlobals'

//if this is browser it uses browser and if it's node then it uses nodes
//TODO remove when node version >= 16
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
    private _referenceProvider!: ReferenceInlineProvider
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
    public origin: RecommendationDetail[]
    public position: number
    private typeAhead: string
    private consolasStatusBar: vscode.StatusBarItem
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
        this.consolasStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
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
        await vscode.commands.executeCommand('setContext', ConsolasConstants.serviceActiveKey, false)
        this.isInlineActive = false
        editor.setDecorations(this.dimDecoration, [])
        this.setConsolasStatusBarOk()
        this.documentUri = vscode.Uri.file('')
    }

    setRange(range: vscode.Range) {
        this._range = range
    }

    setReferenceInlineProvider(provider: ReferenceInlineProvider) {
        this._referenceProvider = provider
    }

    getCompletionItems() {
        const completionItems: RecommendationDetail[] = []
        RecommendationHandler.instance.recommendations.forEach(r => {
            if (r.content.length > 0) {
                completionItems.push(r)
            }
        })
        return completionItems
    }

    async acceptRecommendation(editor: vscode.TextEditor) {
        if (vsCodeState.isConsolasEditing) return
        vsCodeState.isConsolasEditing = true
        await editor
            ?.edit(
                builder => {
                    builder.replace(this._range, this.items[this.position].content)
                },
                { undoStopAfter: false, undoStopBefore: false }
            )
            .then(async () => {
                let languageId = editor?.document?.languageId
                languageId = languageId === ConsolasConstants.typescript ? ConsolasConstants.javascript : languageId
                const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
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
                vsCodeState.isConsolasEditing = false
                this._referenceProvider.removeInlineReference()
                await vscode.commands.executeCommand('aws.consolas.accept', ...acceptArguments)
                await this.resetInlineStates(editor)
            })
    }
    async resetRejectStates(editor: vscode.TextEditor) {
        vsCodeState.isConsolasEditing = false
        await this.resetInlineStates(editor)

        RecommendationHandler.instance.cancelPaginatedRequest()
        // report all recommendation as rejected
        RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(editor, -1)
    }

    async rejectRecommendation(
        editor: vscode.TextEditor | undefined,
        isTypeAheadRejection: boolean = false,
        onDidChangeVisibleTextEditors: boolean = false
    ) {
        if (!editor || vsCodeState.isConsolasEditing) return
        if (!isTypeAheadRejection && this.items.length === 0) return
        vsCodeState.isConsolasEditing = true
        this._referenceProvider.removeInlineReference()
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

        return typedPrefix.substring(move)
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
                textChange.startsWith(ConsolasConstants.lineBreak) ||
                textChange.startsWith(ConsolasConstants.lineBreakWin)
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
        vsCodeState.isConsolasEditing = true
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
                            if (this.isTypeaheadInProgress) this.setRange(new vscode.Range(this._range.start, pos))
                            else this.setRange(new vscode.Range(this._range.start, editor.selection.active))
                            editor.setDecorations(this.dimDecoration, [this._range])
                            // cursor position
                            const position = editor.selection.active
                            const newPosition = position.with(this._range.start.line, this._range.start.character)
                            // set Position
                            const newSelection = new vscode.Selection(newPosition, newPosition)
                            editor.selection = newSelection

                            await vscode.commands.executeCommand('setContext', ConsolasConstants.serviceActiveKey, true)
                            this.isInlineActive = true
                            const curItem = this.items[this.position]
                            this._referenceProvider.setInlineReference(
                                RecommendationHandler.instance.startPos.line,
                                curItem,
                                this.origin[curItem.index].references
                            )
                            RecommendationHandler.instance.recommendationSuggestionState.set(curItem.index, 'Showed')
                        })
                }
            })
        vsCodeState.isConsolasEditing = false
    }

    async navigateRecommendation(editor: vscode.TextEditor, next: boolean) {
        if (!this.items?.length || this.items.length === 1 || vsCodeState.isConsolasEditing || !editor) return
        vsCodeState.isConsolasEditing = true
        if (next) {
            if (this.position === this.items.length - 1) {
                vsCodeState.isConsolasEditing = false
                return
            }
            this.position = Math.min(this.position + 1, this.items.length)
        } else {
            this.position = this.position - 1
            if (this.position < 0) {
                this.position = 0
                vsCodeState.isConsolasEditing = false
                return
            }
        }
        this.setRange(new vscode.Range(editor.selection.active, this._range.end))
        await this.showRecommendation(editor)
    }

    async getPaginatedRecommendation(
        client: DefaultConsolasClient,
        editor: vscode.TextEditor,
        triggerType: telemetry.ConsolasTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: telemetry.ConsolasAutomatedtriggerType
    ) {
        RecommendationHandler.instance.clearRecommendations()
        this.setConsolasStatusBarLoading()
        const isManualTrigger = triggerType === 'OnDemand'
        this.startShowRecommendationTimer(
            isManualTrigger,
            ConsolasConstants.suggestionShowDelay,
            this._pollPeriod,
            editor
        )
        let page = 0
        RecommendationHandler.instance.checkAndResetCancellationTokens()
        this.documentUri = editor.document.uri
        try {
            while (page < this._maxPage) {
                const getRecommendationPromise = RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    triggerType,
                    config,
                    autoTriggerType,
                    true,
                    page
                )
                if (page === 0 && isManualTrigger) {
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: ConsolasConstants.pendingResponse,
                            cancellable: false,
                        },
                        async () => {
                            await getRecommendationPromise
                        }
                    )
                } else {
                    await getRecommendationPromise
                }
                this.setCompletionItems(editor)
                if (RecommendationHandler.instance.checkAndResetCancellationTokens()) {
                    RecommendationHandler.instance.clearRecommendations()
                    break
                }
                if (!RecommendationHandler.instance.hasNextToken()) break
                page++
            }
        } catch (error) {
            getLogger().error(`Error ${error} in getPaginatedRecommendation`)
        }
        this.setConsolasStatusBarOk()
    }
    /*
     * This startShowRecommendationTimer function is to enforce Consolas to only show recommendation
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
                // do not show recommendation if cursor is before invocation position
                // and cancel paginated request
                if (editor.selection.active.isBefore(RecommendationHandler.instance.startPos)) {
                    if (this._timer !== undefined) {
                        clearTimeout(this._timer)
                        this._timer = undefined
                    }
                    RecommendationHandler.instance.cancelPaginatedRequest()
                    return
                }
                this.setCompletionItems(editor)
                if (this.items.length > 0) {
                    this.setRange(new vscode.Range(editor.selection.active, editor.selection.active))
                    await this.showRecommendation(editor)
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
                            if (isManualTrigger) {
                                if (RecommendationHandler.instance.errorMessagePrompt !== '') {
                                    showTimedMessage(RecommendationHandler.instance.errorMessagePrompt, 2000)
                                } else {
                                    showTimedMessage('No suggestions from Consolas', 2000)
                                }
                            }
                        }
                    }
                }
            }
        }, pollPeriod)
    }

    private setCompletionItems(editor: vscode.TextEditor) {
        vsCodeState.isConsolasEditing = true
        this.origin = this.getCompletionItems()
        this.typeAhead = this.getTypedPrefix(editor)
        this.setCompletionItemsUnderTypeAhead()
        vsCodeState.isConsolasEditing = false
    }

    private setCompletionItemsUnderTypeAhead() {
        this.items = []
        if (this.typeAhead.length > 0) {
            this.origin.forEach((item, index) => {
                if (
                    item.content.startsWith(this.typeAhead) &&
                    RecommendationHandler.instance.recommendationSuggestionState.get(index) !== 'Filtered'
                ) {
                    this.items.push({
                        content: item.content.substring(this.typeAhead.length),
                        index: index,
                    })
                }
            })
        } else {
            this.origin.forEach((item, index) => {
                if (RecommendationHandler.instance.recommendationSuggestionState.get(index) !== 'Filtered') {
                    this.items.push({
                        content: item.content,
                        index: index,
                    })
                }
            })
        }
    }

    setConsolasStatusBarLoading() {
        this.consolasStatusBar.text = ` $(loading~spin)Consolas`
        this.consolasStatusBar.show()
    }

    setConsolasStatusBarOk() {
        this.consolasStatusBar.text = ` $(check)Consolas`
        this.consolasStatusBar.show()
    }

    hideConsolasStatusBar() {
        this.consolasStatusBar.hide()
    }

    isPaginationRunning() {
        return this.consolasStatusBar.text === ` $(loading~spin)Consolas`
    }

    get getIsActive() {
        return this.isInlineActive
    }
}
