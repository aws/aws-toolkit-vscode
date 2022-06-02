/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../../shared/telemetry/telemetry'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { RecommendationsList } from '../client/consolas'

export class TelemetryHelper {
    /**
     * to record each recommendation is prefix matched or not with
     * left context before 'editor.action.triggerSuggest'
     */
    public isPrefixMatched: boolean[]

    /**
     * Trigger type for getting Consolas recommendation
     */
    public triggerType: telemetry.ConsolasTriggerType
    /**
     * Auto Trigger Type for getting event of Automated Trigger
     */
    public ConsolasAutomatedtriggerType: telemetry.ConsolasAutomatedtriggerType
    /**
     * completion Type of the consolas recommendation, line vs block
     */
    public completionType: telemetry.ConsolasCompletionType
    /**
     * the cursor offset location at invocation time
     */
    public cursorOffset: number

    constructor() {
        this.isPrefixMatched = []
        this.triggerType = 'OnDemand'
        this.ConsolasAutomatedtriggerType = 'KeyStrokeCount'
        this.completionType = 'Line'
        this.cursorOffset = 0
    }

    static #instance: TelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    /**
     * This function is to record the user decision on each of the suggestion in the list of Consolas recommendations.
     * @param recommendations the recommendations
     * @param acceptIndex the index of the accepted suggestion in the corresponding list of Consolas response.
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
        filtered = false,
        paginationIndex: number
    ) {
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        // emit user decision telemetry
        recommendations.forEach((_elem, i) => {
            telemetry.recordConsolasUserDecision({
                consolasRequestId: requestId,
                consolasSessionId: sessionId ? sessionId : undefined,
                consolasPaginationProgress: paginationIndex,
                consolasTriggerType: this.triggerType,
                consolasSuggestionIndex: i,
                consolasSuggestionState: this.getSuggestionState(i, acceptIndex, filtered),
                consolasSuggestionReferences: JSON.stringify(_elem.references),
                consolasCompletionType: this.completionType,
                consolasLanguage: languageContext.language,
                consolasRuntime: languageContext.runtimeLanguage,
                consolasRuntimeSource: languageContext.runtimeLanguageSource,
            })
        })
    }

    public getSuggestionState(
        i: number,
        acceptIndex: number,
        filtered: boolean = false
    ): telemetry.ConsolasSuggestionState {
        if (filtered) return 'Filter'
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
