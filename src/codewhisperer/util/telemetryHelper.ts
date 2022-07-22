/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { runtimeLanguageContext } from './runtimeLanguageContext'
import { RecommendationsList } from '../client/codewhisperer'
import { isCloud9 } from '../../shared/extensionUtilities'
import { LicenseUtil } from './licenseUtil'

export class TelemetryHelper {
    /**
     * to record each recommendation is prefix matched or not with
     * left context before 'editor.action.triggerSuggest'
     */
    public isPrefixMatched: boolean[]

    /**
     * Trigger type for getting CodeWhisperer recommendation
     */
    public triggerType: telemetry.CodewhispererTriggerType
    /**
     * Auto Trigger Type for getting event of Automated Trigger
     */
    public CodeWhispererAutomatedtriggerType: telemetry.CodewhispererAutomatedTriggerType
    /**
     * completion Type of the CodeWhisperer recommendation, line vs block
     */
    public completionType: telemetry.CodewhispererCompletionType
    /**
     * the cursor offset location at invocation time
     */
    public cursorOffset: number

    constructor() {
        this.isPrefixMatched = []
        this.triggerType = 'OnDemand'
        this.CodeWhispererAutomatedtriggerType = 'KeyStrokeCount'
        this.completionType = 'Line'
        this.cursorOffset = 0
    }

    static #instance: TelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    /**
     * VScode IntelliSense has native matching for recommendation.
     * This is only to check if the recommendation match the updated left context when
     * user keeps typing before getting CodeWhisperer response back.
     * @param recommendations the recommendations of current invocation
     * @param startPos the invocation position of current invocation
     * @param newCodeWhispererRequest if newCodeWhispererRequest, then we need to reset the invocationContext.isPrefixMatched, which is used as
     *                           part of user decision telemetry (see models.ts for more details)
     * @param editor the current VSCode editor
     *
     * @returns
     */
    public updatePrefixMatchArray(
        recommendations: RecommendationsList,
        startPos: vscode.Position,
        newCodeWhispererRequest: boolean,
        editor: vscode.TextEditor | undefined
    ) {
        if (!editor || !newCodeWhispererRequest) {
            return
        }
        // Only works for cloud9, as it works for completion items
        if (isCloud9() && startPos.line !== editor.selection.active.line) {
            return
        }

        let typedPrefix = ''
        if (newCodeWhispererRequest) {
            this.isPrefixMatched = []
        }

        typedPrefix = editor.document.getText(new vscode.Range(startPos, editor.selection.active))

        recommendations.forEach(recommendation => {
            if (recommendation.content.startsWith(typedPrefix)) {
                if (newCodeWhispererRequest) {
                    this.isPrefixMatched.push(true)
                }
            } else {
                if (newCodeWhispererRequest) {
                    this.isPrefixMatched.push(false)
                }
            }
        })
    }

    /**
     * This function is to record the user decision on each of the suggestion in the list of CodeWhisperer recommendations.
     * @param recommendations the recommendations
     * @param acceptIndex the index of the accepted suggestion in the corresponding list of CodeWhisperer response.
     * If this function is not called on acceptance, then acceptIndex == -1
     * @param languageId the language ID of the current document in current active editor
     * @param filtered whether this user decision is to filter the recommendation due to license
     */

    public async recordUserDecisionTelemetry(
        requestId: string,
        sessionId: string,
        recommendations: RecommendationsList,
        acceptIndex: number,
        languageId: string | undefined,
        paginationIndex: number,
        recommendationSuggestionState?: Map<number, string>
    ) {
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        // emit user decision telemetry
        recommendations.forEach((_elem, i) => {
            let unseen = true
            let filtered = false
            if (recommendationSuggestionState !== undefined) {
                if (recommendationSuggestionState.get(i) === 'Filtered') {
                    filtered = true
                }
                if (recommendationSuggestionState.get(i) === 'Showed') {
                    unseen = false
                }
            }
            let uniqueSuggestionReferences: string | undefined = undefined
            const uniqueLicenseSet = LicenseUtil.getUniqueLicenseNames(_elem.references)
            if (uniqueLicenseSet.size > 0) {
                uniqueSuggestionReferences = JSON.stringify(Array.from(uniqueLicenseSet))
            }
            telemetry.recordCodewhispererUserDecision({
                codewhispererRequestId: requestId,
                codewhispererSessionId: sessionId ? sessionId : undefined,
                codewhispererPaginationProgress: paginationIndex,
                codewhispererTriggerType: this.triggerType,
                codewhispererSuggestionIndex: i,
                codewhispererSuggestionState: this.getSuggestionState(i, acceptIndex, filtered, unseen),
                codewhispererSuggestionReferences: uniqueSuggestionReferences,
                codewhispererSuggestionReferenceCount: _elem.references ? _elem.references.length : 0,
                codewhispererCompletionType: this.completionType,
                codewhispererLanguage: languageContext.language,
            })
        })
    }

    public getSuggestionState(
        i: number,
        acceptIndex: number,
        filtered: boolean = false,
        unseen: boolean = false
    ): telemetry.CodewhispererSuggestionState {
        if (filtered) return 'Filter'
        if (unseen) return 'Unseen'
        if (acceptIndex == -1) {
            return this.isPrefixMatched[i] ? 'Reject' : 'Discard'
        }
        if (!this.isPrefixMatched[i]) {
            return 'Discard'
        } else {
            if (i == acceptIndex) {
                return 'Accept'
            } else {
                return 'Ignore'
            }
        }
    }
}
