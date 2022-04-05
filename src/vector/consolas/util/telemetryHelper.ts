/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../../shared/telemetry/telemetry'
import { recommendations, telemetryContext } from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { DefaultSettingsConfiguration } from '../../../shared/settingsConfiguration'
import { getLogger } from '../../../shared/logger'

export class TelemetryHelper {
    /**
     * This function is to record the user decision on each of the suggestion in the list of Consolas recommendations.
     * @param acceptIndex the index of the accepted suggestion in the corresponding list of Consolas response.
     * If this function is not called on acceptance, then acceptIndex == -1
     * @param languageId the language ID of the current document in current active editor
     */
    public static async recordUserDecisionTelemetry(acceptIndex: number, languageId: string | undefined) {
        const languageContext = runtimeLanguageContext.languageContexts[languageId as string]
        // emit user decision telemetry
        recommendations.response.forEach((_elem, i) => {
            telemetry.recordConsolasUserDecision({
                consolasRequestId: recommendations.requestId,
                consolasTriggerType: telemetryContext.triggerType,
                consolasSuggestionIndex: i,
                consolasSuggestionState: this.recordSuggestionState(telemetryContext.isPrefixMatched, i, acceptIndex),
                consolasCompletionType: telemetryContext.completionType,
                consolasLanguage: languageContext.language,
                consolasRuntime: languageContext.runtimeLanguage,
                consolasRuntimeSource: languageContext.runtimeLanguageSource,
            })

            this.telemetryLogging(
                recommendations.requestId,
                telemetryContext.triggerType,
                i,
                this.recordSuggestionState(telemetryContext.isPrefixMatched, i, acceptIndex),
                telemetryContext.completionType,
                languageContext.language,
                languageContext.runtimeLanguage,
                languageContext.runtimeLanguageSource
            )
        })

        /**
         * Clear recommendation queue
         */
        recommendations.response = []
    }

    private static async telemetryLogging(
        requestId: string,
        triggerType: telemetry.ConsolasTriggerType,
        index: number,
        suggestionState: telemetry.ConsolasSuggestionState,
        completionType: telemetry.ConsolasCompletionType,
        language: string,
        languageRuntime: telemetry.ConsolasRuntime,
        languageRuntimeSource: string
    ) {
        const settings = new DefaultSettingsConfiguration('aws')
        if (settings.readDevSetting<boolean>('aws.dev.consolasTelemetryLogging', 'boolean', true)) {
            getLogger().verbose(
                `Consolas Telemetry UserDecision Event: RequestID: ${requestId}, TriggerType: ${triggerType}, CompletionType: ${completionType}, Index: ${index}, SuggestionState: ${suggestionState}, Language: ${language}, Language Runtime: ${languageRuntime}, Language Runtime Source: ${languageRuntimeSource}`
            )
            getLogger().verbose('------------------------------------------------------------------------------')
        }
    }

    public static recordSuggestionState(
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
