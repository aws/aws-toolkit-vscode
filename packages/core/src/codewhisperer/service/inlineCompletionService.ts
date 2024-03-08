/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CodeSuggestionsState, ConfigurationEntry, GetRecommendationsResponse, vsCodeState } from '../models/model'
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
import { getSelectedCustomization } from '../util/customizationUtil'
import { codicon, getIcon } from '../../shared/icons'
import { session } from '../util/codeWhispererSession'
import { noSuggestions } from '../models/constants'
import { Commands } from '../../shared/vscode/commands2'
import { listCodeWhispererCommandsId } from '../ui/statusBar'

const performance = globalThis.performance ?? require('perf_hooks').performance

export class InlineCompletionService {
    private maxPage = 100
    private statusBar: CodeWhispererStatusBar
    private _showRecommendationTimer?: NodeJS.Timer

    constructor(statusBar: CodeWhispererStatusBar = CodeWhispererStatusBar.instance) {
        this.statusBar = statusBar

        RecommendationHandler.instance.onDidReceiveRecommendation(e => {
            this.startShowRecommendationTimer()
        })

        CodeSuggestionsState.instance.onDidChangeState(() => {
            return this.refreshStatusBar()
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
            this.sharedTryShowRecommendation()
                .catch(e => {
                    getLogger().error('tryShowRecommendation failed: %s', (e as Error).message)
                })
                .finally(() => {
                    if (this._showRecommendationTimer) {
                        clearInterval(this._showRecommendationTimer)
                        this._showRecommendationTimer = undefined
                    }
                })
        }, CodeWhispererConstants.showRecommendationTimerPollPeriod)
    }

    async getPaginatedRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ): Promise<GetRecommendationsResponse> {
        if (vsCodeState.isCodeWhispererEditing || RecommendationHandler.instance.isSuggestionVisible()) {
            return {
                result: 'Failed',
                errorMessage: 'codewhisperer already is running',
                recommendationCount: 0,
            }
        }

        // Call report user decisions once to report recommendations leftover from last invocation.
        RecommendationHandler.instance.reportUserDecisions(-1)
        TelemetryHelper.instance.setInvokeSuggestionStartTime()
        ClassifierTrigger.instance.recordClassifierResultForAutoTrigger(editor, autoTriggerType, event)

        const triggerChar = event?.contentChanges[0]?.text
        if (autoTriggerType === 'SpecialCharacters' && triggerChar) {
            TelemetryHelper.instance.setTriggerCharForUserTriggerDecision(triggerChar)
        }
        const isAutoTrigger = triggerType === 'AutoTrigger'
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.notifyReauthenticate(isAutoTrigger)
            return {
                result: 'Failed',
                errorMessage: 'auth',
                recommendationCount: 0,
            }
        }

        await this.setState('loading')

        TelemetryHelper.instance.setInvocationStartTime(performance.now())
        RecommendationHandler.instance.checkAndResetCancellationTokens()
        RecommendationHandler.instance.documentUri = editor.document.uri
        let response: GetRecommendationsResponse = {
            result: 'Failed',
            errorMessage: undefined,
            recommendationCount: 0,
        }
        try {
            let page = 0
            while (page < this.maxPage) {
                response = await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    triggerType,
                    config,
                    autoTriggerType,
                    true,
                    page
                )
                if (RecommendationHandler.instance.checkAndResetCancellationTokens()) {
                    RecommendationHandler.instance.reportUserDecisions(-1)
                    await vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
                    return {
                        result: 'Failed',
                        errorMessage: 'cancelled',
                        recommendationCount: 0,
                    }
                }
                if (!RecommendationHandler.instance.hasNextToken()) {
                    break
                }
                page++
            }
        } catch (error) {
            getLogger().error(`Error ${error} in getPaginatedRecommendation`)
        }
        await vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
        if (triggerType === 'OnDemand' && session.recommendations.length === 0) {
            void showTimedMessage(response.errorMessage ? response.errorMessage : noSuggestions, 2000)
        }
        TelemetryHelper.instance.tryRecordClientComponentLatency()

        return {
            result: 'Succeeded',
            errorMessage: undefined,
            recommendationCount: session.recommendations.length,
        }
    }

    /** Updates the status bar to represent the latest CW state */
    refreshStatusBar() {
        if (AuthUtil.instance.isConnectionValid()) {
            return this.setState('ok')
        } else if (AuthUtil.instance.isConnectionExpired()) {
            return this.setState('expired')
        } else {
            return this.setState('notConnected')
        }
    }

    private async setState(state: keyof typeof states) {
        switch (state) {
            case 'loading': {
                await this.statusBar.setState('loading')
                break
            }
            case 'ok': {
                await this.statusBar.setState('ok', CodeSuggestionsState.instance.isSuggestionsEnabled())
                break
            }
            case 'expired': {
                await this.statusBar.setState('expired')
                break
            }
            case 'notConnected': {
                await this.statusBar.setState('notConnected')
                break
            }
        }
    }
}

/** The states that the completion service can be in */
const states = {
    loading: 'loading',
    ok: 'ok',
    expired: 'expired',
    notConnected: 'notConnected',
} as const

export class CodeWhispererStatusBar {
    protected statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)

    static #instance: CodeWhispererStatusBar
    static get instance() {
        return (this.#instance ??= new this())
    }

    protected constructor() {}

    async setState(state: keyof Omit<typeof states, 'ok'>): Promise<void>
    async setState(status: keyof Pick<typeof states, 'ok'>, isSuggestionsEnabled: boolean): Promise<void>
    async setState(status: keyof typeof states, isSuggestionsEnabled?: boolean): Promise<void> {
        const statusBar = this.statusBar
        statusBar.command = listCodeWhispererCommandsId
        statusBar.backgroundColor = undefined

        switch (status) {
            case 'loading': {
                const selectedCustomization = getSelectedCustomization()
                statusBar.text = codicon` ${getIcon('vscode-loading~spin')} CodeWhisperer${
                    selectedCustomization.arn === '' ? '' : ` | ${selectedCustomization.name}`
                }`
                break
            }
            case 'ok': {
                const selectedCustomization = getSelectedCustomization()
                const icon = isSuggestionsEnabled ? getIcon('vscode-debug-start') : getIcon('vscode-debug-pause')
                statusBar.text = codicon`${icon} CodeWhisperer${
                    selectedCustomization.arn === '' ? '' : ` | ${selectedCustomization.name}`
                }`
                break
            }

            case 'expired': {
                statusBar.text = codicon` ${getIcon('vscode-debug-disconnect')} CodeWhisperer`
                statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
                break
            }
            case 'notConnected':
                statusBar.text = codicon` ${getIcon('vscode-chrome-close')} CodeWhisperer`
                break
        }

        statusBar.show()
    }
}

/** In this module due to circulare dependency issues */
export const refreshStatusBar = Commands.declare(
    { id: 'aws.codeWhisperer.refreshStatusBar', logging: false },
    () => async () => {
        await InlineCompletionService.instance.refreshStatusBar()
    }
)
