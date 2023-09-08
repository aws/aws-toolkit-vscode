/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ConfigurationEntry, vsCodeState } from '../models/model'
import * as CodeWhispererConstants from '../models/constants'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { RecommendationHandler } from './recommendationHandler'
import { CodewhispererAutomatedTriggerType, CodewhispererTriggerType } from '../../shared/telemetry/telemetry'
import { showTimedMessage } from '../../shared/utilities/messages'
import { getLogger } from '../../shared/logger/logger'
import { TelemetryHelper } from '../util/telemetryHelper'
import { AuthUtil } from '../util/authUtil'
import { shared } from '../../shared/utilities/functionUtils'
import { ClassifierTrigger } from './classifierTrigger'
import { session } from '../util/codeWhispererSession'

const performance = globalThis.performance ?? require('perf_hooks').performance

export class InlineCompletionService {
    private maxPage = 100
    private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
    private _showRecommendationTimer?: NodeJS.Timer
    private _isPaginationRunning = false

    constructor() {
        RecommendationHandler.instance.onDidReceiveRecommendation(e => {
            this.startShowRecommendationTimer()
        })
    }

    static #instance: InlineCompletionService

    public static get instance() {
        return (this.#instance ??= new this())
    }

    filePath(): string | undefined {
        return RecommendationHandler.instance.documentUri?.fsPath
    }

    private sharedTryShowRecommendation = shared(
        RecommendationHandler.instance.tryShowRecommendation.bind(RecommendationHandler.instance)
    )

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

    async getPaginatedRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        console.log('check if pagination is running')
        if (
            vsCodeState.isCodeWhispererEditing ||
            this._isPaginationRunning ||
            RecommendationHandler.instance.isSuggestionVisible()
        ) {
            console.log('blocked by current invocation')
            return
        }
        console.log('enter new invocation')
        this.setCodeWhispererStatusBarLoading()
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
        RecommendationHandler.instance.checkAndResetCancellationTokens()
        RecommendationHandler.instance.documentUri = editor.document.uri
        try {
            let page = 0
            while (page < this.maxPage) {
                console.log
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
                    // RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
                    // vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
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
        if (triggerType === 'OnDemand' && session.recommendations.length === 0) {
            if (RecommendationHandler.instance.errorMessagePrompt !== '') {
                showTimedMessage(RecommendationHandler.instance.errorMessagePrompt, 2000)
            } else {
                showTimedMessage(CodeWhispererConstants.noSuggestions, 2000)
            }
        }
        TelemetryHelper.instance.tryRecordClientComponentLatency(editor.document.languageId)
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
        console.log(`end sessionId: ${session.sessionId}`)
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
}
