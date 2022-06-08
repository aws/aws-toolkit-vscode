/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { DefaultConsolasClient } from '../client/consolas'
import * as EditorContext from '../util/editorContext'
import { ConsolasConstants } from '../models/constants'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { resetIntelliSenseState } from '../util/globalStateUtil'
import { TelemetryHelper } from '../util/telemetryHelper'
import { getLogger } from '../../../shared/logger'
import { InlineCompletion } from './inlineCompletion'
import { ConsolasCodeCoverageTracker } from '../tracker/consolasCodeCoverageTracker'
import globals from '../../../shared/extensionGlobals'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { RecommendationHandler } from './recommendationHandler'

//if this is browser it uses browser and if it's node then it uses nodes
//TODO remove when node version >= 16
const performance = globalThis.performance ?? require('perf_hooks').performance

/**
 * This class is for Consolas auto trigger
 */
export class KeyStrokeHandler {
    /**
     * Speical character which automated triggers consolas
     */
    public specialChar: string
    /**
     * Key stroke count for automated trigger
     */
    public keyStrokeCount: number

    constructor() {
        this.specialChar = ''
        this.keyStrokeCount = 0
    }

    static #instance: KeyStrokeHandler

    public static get instance() {
        return (this.#instance ??= new this())
    }

    async processKeyStroke(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        client: DefaultConsolasClient,
        config: ConfigurationEntry
    ): Promise<void> {
        try {
            const content = event.contentChanges[0].text
            const languageContext = runtimeLanguageContext.getLanguageContext(editor.document.languageId)
            ConsolasCodeCoverageTracker.getTracker(
                languageContext.language,
                globals.context.globalState
            ).setTotalTokens(content)
            const changedText = this.getChangedText(event, config.isAutomatedTriggerEnabled, editor)
            if (changedText === '') {
                return
            }
            const autoTriggerType = this.getAutoTriggerReason(changedText)
            if (autoTriggerType === '') {
                return
            }
            const triggerTtype = autoTriggerType as telemetry.ConsolasAutomatedtriggerType
            this.invokeAutomatedTrigger(triggerTtype, editor, client, config)
        } catch (error) {
            getLogger().error('Automated Trigger Exception : ', error)
            getLogger().verbose(`Automated Trigger Exception : ${error}`)
        }
    }

    getAutoTriggerReason(changedText: string): string {
        for (const val of ConsolasConstants.specialCharactersList) {
            if (changedText.includes(val)) {
                this.specialChar = val
                if (val === ConsolasConstants.lineBreak) {
                    return 'Enter'
                } else {
                    return 'SpecialCharacters'
                }
            }
        }
        if (changedText.includes(ConsolasConstants.space)) {
            let isTab = true
            let space = 0
            for (let i = 0; i < changedText.length; i++) {
                if (changedText[i] !== ' ') {
                    isTab = false
                    break
                } else {
                    space++
                }
            }
            if (isTab && space > 1 && space <= EditorContext.getTabSize()) {
                return 'SpecialCharacters'
            }
        }
        /**
         * Time duration between 2 invocations should be greater than the threshold
         * This threshold does not applies to Enter | SpecialCharacters type auto trigger.
         */
        const duration = Math.floor((performance.now() - RecommendationHandler.instance.lastInvocationTime) / 1000)
        if (duration < ConsolasConstants.invocationTimeIntervalThreshold) {
            return ''
        }
        if (this.keyStrokeCount >= ConsolasConstants.invocationKeyThreshold) {
            return 'KeyStrokeCount'
        } else {
            this.keyStrokeCount += 1
        }
        // Below condition is very likely a multi character insert when user accept native intelliSense suggestion
        // VS Code does not provider API for intelliSense suggestion acceptance
        if (changedText.length > 1 && !changedText.includes(' ') && changedText.length < 40) {
            return 'Enter'
        }
        return ''
    }

    getChangedText(
        event: vscode.TextDocumentChangeEvent,
        isAutomatedTriggerEnabled: boolean,
        editor: vscode.TextEditor
    ): string {
        if (!isAutomatedTriggerEnabled) {
            return ''
        }
        /**
         * Skip when output channel gains focus and invoke
         */
        if (editor.document.languageId === 'Log') {
            return ''
        }
        /**
         * Pause automated trigger when typed input matches recommendation prefix
         * for both intelliSense and inline
         */
        TelemetryHelper.instance.updatePrefixMatchArray(
            RecommendationHandler.instance.recommendations,
            RecommendationHandler.instance.startPos,
            true,
            editor
        )
        if (vsCodeState.isIntelliSenseActive && TelemetryHelper.instance.isPrefixMatched.length > 0) {
            return ''
        }
        if (InlineCompletion.instance.isTypeaheadInProgress) {
            return ''
        }

        /**
         * DO NOT auto trigger Consolas when appending muli-line snippets to document
         * DO NOT auto trigger Consolas when deleting or undo
         */
        const changedText = event.contentChanges[0].text
        const changedRange = event.contentChanges[0].range
        if (!changedRange.isSingleLine || changedText === '') {
            return ''
        }
        return changedText
    }
    async invokeAutomatedTrigger(
        autoTriggerType: telemetry.ConsolasAutomatedtriggerType,
        editor: vscode.TextEditor,
        client: DefaultConsolasClient,
        config: ConfigurationEntry
    ): Promise<void> {
        if (isCloud9())
            resetIntelliSenseState(
                config.isManualTriggerEnabled,
                config.isAutomatedTriggerEnabled,
                RecommendationHandler.instance.isValidResponse()
            )
        if (editor) {
            this.keyStrokeCount = 0
            if (isCloud9()) {
                if (!vsCodeState.isIntelliSenseActive) {
                    RecommendationHandler.instance.clearRecommendations()
                    await RecommendationHandler.instance.getRecommendations(
                        client,
                        editor,
                        'AutoTrigger',
                        config,
                        autoTriggerType,
                        false
                    )
                    if (RecommendationHandler.instance.isValidResponse()) {
                        vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                            vsCodeState.isIntelliSenseActive = true
                        })
                    }
                }
            } else {
                // no concurrent pagination request
                if (!vsCodeState.isConsolasEditing && !InlineCompletion.instance.isPaginationRunning()) {
                    await InlineCompletion.instance.resetInlineStates(editor)
                    InlineCompletion.instance.getPaginatedRecommendation(
                        client,
                        editor,
                        'AutoTrigger',
                        config,
                        autoTriggerType
                    )
                }
            }
        }
    }
}
