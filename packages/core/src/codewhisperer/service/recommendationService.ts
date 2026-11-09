/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ConfigurationEntry, GetRecommendationsResponse } from '../models/model'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import {
    CodewhispererAutomatedTriggerType,
    CodewhispererTriggerType,
    telemetry,
} from '../../shared/telemetry/telemetry'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { ClassifierTrigger } from './classifierTrigger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { randomUUID } from '../../shared/crypto'
import { TelemetryHelper } from '../util/telemetryHelper'
import { AuthUtil } from '../util/authUtil'

export interface SuggestionActionEvent {
    readonly editor: vscode.TextEditor | undefined
    readonly isRunning: boolean
    readonly triggerType: CodewhispererTriggerType
    readonly response: GetRecommendationsResponse | undefined
}

export class RecommendationService {
    static #instance: RecommendationService

    private _isRunning: boolean = false
    get isRunning() {
        return this._isRunning
    }

    private _onSuggestionActionEvent = new vscode.EventEmitter<SuggestionActionEvent>()
    get suggestionActionEvent(): vscode.Event<SuggestionActionEvent> {
        return this._onSuggestionActionEvent.event
    }

    private _acceptedSuggestionCount: number = 0
    get acceptedSuggestionCount() {
        return this._acceptedSuggestionCount
    }

    private _totalValidTriggerCount: number = 0
    get totalValidTriggerCount() {
        return this._totalValidTriggerCount
    }

    public static get instance() {
        return (this.#instance ??= new RecommendationService())
    }

    incrementAcceptedCount() {
        this._acceptedSuggestionCount++
    }

    incrementValidTriggerCount() {
        this._totalValidTriggerCount++
    }

    async generateRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        // TODO: should move all downstream auth check(inlineCompletionService, recommendationHandler etc) to here(upstream) instead of spreading everywhere
        if (AuthUtil.instance.isConnected() && AuthUtil.instance.requireProfileSelection()) {
            return
        }

        if (this._isRunning) {
            return
        }

        /**
         * Use an existing trace ID if invoked through a command (e.g., manual invocation),
         * otherwise generate a new trace ID
         */
        const traceId = telemetry.attributes?.traceId ?? randomUUID()
        TelemetryHelper.instance.setTraceId(traceId)
        await telemetry.withTraceId(async () => {
            if (isInlineCompletionEnabled()) {
                if (triggerType === 'OnDemand') {
                    ClassifierTrigger.instance.recordClassifierResultForManualTrigger(editor)
                }

                this._isRunning = true
                let response: GetRecommendationsResponse | undefined = undefined

                try {
                    this._onSuggestionActionEvent.fire({
                        editor: editor,
                        isRunning: true,
                        triggerType: triggerType,
                        response: undefined,
                    })

                    response = await InlineCompletionService.instance.getPaginatedRecommendation(
                        client,
                        editor,
                        triggerType,
                        config,
                        autoTriggerType,
                        event
                    )
                } finally {
                    this._isRunning = false
                    this._onSuggestionActionEvent.fire({
                        editor: editor,
                        isRunning: false,
                        triggerType: triggerType,
                        response: response,
                    })
                }
            }
        }, traceId)
    }
}
