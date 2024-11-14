/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConfigurationEntry, DefaultCodeWhispererClient } from '..'
import { RecommendationService } from './recommendationService'
import { CodewhispererAutomatedTriggerType, CodewhispererTriggerType } from '../../shared/telemetry'

export class NextRecommendationProvider {
    async getNextRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        config: ConfigurationEntry,
        triggerType: CodewhispererTriggerType,
        autoTriggerType?: CodewhispererAutomatedTriggerType
    ) {
        const recommendations = await RecommendationService.instance.generateRecommendation(
            client,
            editor,
            triggerType,
            config,
            autoTriggerType
        )
        return recommendations
    }
}
