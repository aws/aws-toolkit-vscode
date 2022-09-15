/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import * as EditorContext from '../util/editorContext'
import * as CodeWhispererConstants from '../models/constants'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { getLogger } from '../../shared/logger'
import { InlineCompletion } from './inlineCompletion'
import { isCloud9 } from '../../shared/extensionUtilities'
import { RecommendationHandler } from './recommendationHandler'
import { CodewhispererAutomatedTriggerType } from '../../shared/telemetry/telemetry'

const performance = globalThis.performance ?? require('perf_hooks').performance

/**
 * This class is for CodeWhisperer auto trigger
 */
export class KeyStrokeHandler {
    /**
     * Speical character which automated triggers codewhisperer
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
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ): Promise<void> {
        try {
            const changedText = this.getChangedText(event, config.isAutomatedTriggerEnabled, editor)
            if (changedText === '') {
                return
            }
            const autoTriggerType = this.getAutoTriggerReason(changedText)
            if (autoTriggerType === '') {
                return
            }
            const triggerTtype = autoTriggerType as CodewhispererAutomatedTriggerType
            this.invokeAutomatedTrigger(triggerTtype, editor, client, config)
        } catch (error) {
            getLogger().error('Automated Trigger Exception : ', error)
            getLogger().verbose(`Automated Trigger Exception : ${error}`)
        }
    }

    getAutoTriggerReason(changedText: string): string {
        for (const val of CodeWhispererConstants.specialCharactersList) {
            if (changedText.includes(val)) {
                this.specialChar = val
                if (val === CodeWhispererConstants.lineBreak) {
                    return 'Enter'
                } else {
                    return 'SpecialCharacters'
                }
            }
        }
        if (changedText.includes(CodeWhispererConstants.space)) {
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
        if (duration < CodeWhispererConstants.invocationTimeIntervalThreshold) {
            return ''
        }
        if (this.keyStrokeCount >= CodeWhispererConstants.invocationKeyThreshold) {
            return 'KeyStrokeCount'
        } else {
            this.keyStrokeCount += 1
        }
        // Below condition is very likely a multi character insert when user accept native intelliSense suggestion
        // VS Code does not provider API for intelliSense suggestion acceptance
        if (changedText.length > 1 && !changedText.includes(' ') && changedText.length < 40 && !isCloud9()) {
            return 'IntelliSenseAcceptance'
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
         * Skip Cloud9 IntelliSense acceptance event
         */
        if (
            isCloud9() &&
            event.contentChanges.length > 0 &&
            RecommendationHandler.instance.recommendations.length > 0
        ) {
            if (event.contentChanges[0].text === RecommendationHandler.instance.recommendations[0].content) {
                return ''
            }
        }
        /**
         * Pause automated trigger when typed input matches recommendation prefix
         * for inline suggestion
         */
        if (InlineCompletion.instance.isTypeaheadInProgress) {
            return ''
        }

        /**
         * DO NOT auto trigger CodeWhisperer when appending muli-line snippets to document
         * DO NOT auto trigger CodeWhisperer when deleting or undo
         */
        const changedText = event.contentChanges[0].text
        const changedRange = event.contentChanges[0].range
        if (!changedRange.isSingleLine || changedText === '') {
            return ''
        }
        if (changedText.split('\n').length > 1) {
            return ''
        }
        return changedText
    }
    async invokeAutomatedTrigger(
        autoTriggerType: CodewhispererAutomatedTriggerType,
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ): Promise<void> {
        if (editor) {
            this.keyStrokeCount = 0
            if (isCloud9()) {
                if (RecommendationHandler.instance.isGenerateRecommendationInProgress) return
                vsCodeState.isIntelliSenseActive = false
                RecommendationHandler.instance.isGenerateRecommendationInProgress = true
                try {
                    RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(editor, -1)
                    RecommendationHandler.instance.clearRecommendations()
                    await RecommendationHandler.instance.getRecommendations(
                        client,
                        editor,
                        'AutoTrigger',
                        config,
                        autoTriggerType,
                        false
                    )
                    if (RecommendationHandler.instance.canShowRecommendationInIntelliSense(editor, false)) {
                        await vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                            vsCodeState.isIntelliSenseActive = true
                        })
                    }
                } finally {
                    RecommendationHandler.instance.isGenerateRecommendationInProgress = false
                }
            } else {
                if (!vsCodeState.isCodeWhispererEditing && !InlineCompletion.instance.isPaginationRunning()) {
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
