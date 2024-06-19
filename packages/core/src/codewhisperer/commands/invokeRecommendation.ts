/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { resetIntelliSenseState } from '../util/globalStateUtil'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { isCloud9 } from '../../shared/extensionUtilities'
import { RecommendationHandler } from '../service/recommendationHandler'
import { session } from '../util/codeWhispererSession'
import { RecommendationService } from '../service/recommendationService'

/**
 * This function is for manual trigger CodeWhisperer
 */

export async function invokeRecommendation(
    editor: vscode.TextEditor,
    client: DefaultCodeWhispererClient,
    config: ConfigurationEntry
) {
    if (!config.isManualTriggerEnabled) {
        return
    }
    /**
     * IntelliSense in Cloud9 needs editor.suggest.showMethods
     */
    if (!config.isShowMethodsEnabled && isCloud9()) {
        void vscode.window.showWarningMessage('Turn on "editor.suggest.showMethods" to use Amazon Q inline suggestions')
        return
    }
    if (!editor) {
        return
    }

    /**
     * Skip when output channel gains focus and invoke
     */
    if (editor.document.languageId === 'Log') {
        return
    }
    /**
     * When using intelliSense, if invocation position changed, reject previous active recommendations
     */
    if (vsCodeState.isIntelliSenseActive && editor.selection.active !== session.startPos) {
        resetIntelliSenseState(
            config.isManualTriggerEnabled,
            config.isAutomatedTriggerEnabled,
            RecommendationHandler.instance.isValidResponse()
        )
    }

    await RecommendationService.instance.generateRecommendation(client, editor, 'OnDemand', config, undefined)
}
