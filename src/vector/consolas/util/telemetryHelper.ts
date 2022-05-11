/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../../shared/telemetry/telemetry'
import { recommendations, telemetryContext } from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'

export class TelemetryHelper {
    /**
     * This function is to record the user decision on each of the suggestion in the list of Consolas recommendations.
     * @param acceptIndex the index of the accepted suggestion in the corresponding list of Consolas response.
     * If this function is not called on acceptance, then acceptIndex == -1
     * @param languageId the language ID of the current document in current active editor
     */
    public static async recordUserDecisionTelemetry(acceptIndex: number, languageId: string | undefined) {
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        // emit user decision telemetry
        recommendations.response.forEach((_elem, i) => {
            telemetry.recordConsolasUserDecision({
                consolasRequestId: recommendations.requestId ? recommendations.requestId : undefined,
                consolasTriggerType: telemetryContext.triggerType,
                consolasSuggestionIndex: i,
                consolasSuggestionState: this.getSuggestionState(telemetryContext.isPrefixMatched, i, acceptIndex),
                consolasCompletionType: telemetryContext.completionType,
                consolasLanguage: languageContext.language,
                consolasRuntime: languageContext.runtimeLanguage,
                consolasRuntimeSource: languageContext.runtimeLanguageSource,
            })
        })

        /**
         * Clear recommendation queue
         */
        recommendations.response = []
    }

    public static getSuggestionState(
        isPrefixMatched: boolean[],
        i: number,
        acceptIndex: number
    ): telemetry.ConsolasSuggestionState {
        if (acceptIndex == -1) {
            return isPrefixMatched[i] ? 'Reject' : 'Discard'
        }
        if (!isPrefixMatched[i]) {
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
