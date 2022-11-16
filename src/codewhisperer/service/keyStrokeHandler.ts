/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { getLogger } from '../../shared/logger'
import { InlineCompletion } from './inlineCompletion'
import { isCloud9 } from '../../shared/extensionUtilities'
import { RecommendationHandler } from './recommendationHandler'
import { CodewhispererAutomatedTriggerType } from '../../shared/telemetry/telemetry'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { InlineCompletionService } from './inlineCompletionService'

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
            if (!config.isAutomatedTriggerEnabled) {
                return
            }

            // Skip when output channel gains focus and invoke
            if (editor.document.languageId === 'Log') {
                return
            }

            // Pause automated trigger when typed input matches recommendation prefix for inline suggestion
            if (InlineCompletion.instance.isTypeaheadInProgress) {
                return
            }

            // Skip Cloud9 IntelliSense acceptance event
            if (
                isCloud9() &&
                event.contentChanges.length > 0 &&
                RecommendationHandler.instance.recommendations.length > 0
            ) {
                if (event.contentChanges[0].text === RecommendationHandler.instance.recommendations[0].content) {
                    return
                }
            }

            let triggerType: CodewhispererAutomatedTriggerType | undefined
            const changedSource = new DefaultDocumentChangedType(event.contentChanges).checkChangeSource()
            // Time duration between 2 invocations should be greater than the threshold
            // This threshold does not applies to Enter | SpecialCharacters | IntelliSenseAcceptance type auto trigger.
            const duration = Math.floor((performance.now() - RecommendationHandler.instance.lastInvocationTime) / 1000)
            switch (changedSource) {
                case DocumentChangedSource.EnterKey: {
                    this.keyStrokeCount += 1
                    triggerType = 'Enter'
                    break
                }
                case DocumentChangedSource.SpecialCharsKey: {
                    this.keyStrokeCount += 1
                    triggerType = 'SpecialCharacters'
                    break
                }
                case DocumentChangedSource.IntelliSense: {
                    this.keyStrokeCount += 1
                    triggerType = 'IntelliSenseAcceptance'
                    break
                }
                case DocumentChangedSource.RegularKey: {
                    // text length can be greater than 1 in Cloud9
                    this.keyStrokeCount += event.contentChanges[0].text.length
                    if (
                        this.keyStrokeCount >= 15 &&
                        duration >= CodeWhispererConstants.invocationTimeIntervalThreshold
                    ) {
                        triggerType = 'KeyStrokeCount'
                        this.keyStrokeCount = 0
                    }
                    break
                }
                default: {
                    break
                }
            }

            if (triggerType) {
                this.invokeAutomatedTrigger(triggerType, editor, client, config)
            }
        } catch (error) {
            getLogger().error('Automated Trigger Exception : ', error)
            getLogger().verbose(`Automated Trigger Exception : ${error}`)
        }
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
                if (RecommendationHandler.instance.isGenerateRecommendationInProgress) {
                    return
                }
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
            } else if (isInlineCompletionEnabled()) {
                InlineCompletionService.instance.getPaginatedRecommendation(
                    client,
                    editor,
                    'AutoTrigger',
                    config,
                    autoTriggerType
                )
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

export abstract class DocumentChangedType {
    constructor(protected readonly contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        this.contentChanges = contentChanges
    }

    abstract checkChangeSource(): DocumentChangedSource

    // Enter key should always start with ONE '\n' or '\r\n' and potentially following spaces due to IDE reformat
    protected isEnterKey(str: string): boolean {
        if (str.length === 0) {
            return false
        }
        return (
            (str.startsWith('\r\n') && str.substring(2).trim() === '') ||
            (str[0] === '\n' && str.substring(1).trim() === '')
        )
    }

    // Tab should consist of space char only ' ' and the length % tabSize should be 0
    protected isTabKey(str: string): boolean {
        const tabSize = getTabSizeSetting()
        if (str.length % tabSize === 0 && str.trim() === '') {
            return true
        }
        return false
    }

    protected isUserTypingSpecialChar(str: string): boolean {
        return ['(', '()', '[', '[]', '{', '{}', ':'].includes(str)
    }

    protected isSingleLine(str: string): boolean {
        let newLineCounts = 0
        for (const ch of str) {
            if (ch === '\n') {
                newLineCounts += 1
            }
        }

        // since pressing Enter key possibly will generate string like '\n        ' due to indention
        if (this.isEnterKey(str)) {
            return true
        }
        if (newLineCounts >= 1) {
            return false
        }
        return true
    }
}

export class DefaultDocumentChangedType extends DocumentChangedType {
    constructor(contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        super(contentChanges)
    }

    checkChangeSource(): DocumentChangedSource {
        if (this.contentChanges.length === 0) {
            return DocumentChangedSource.Unknown
        }

        // event.contentChanges.length will be 2 when user press Enter key multiple times
        if (this.contentChanges.length > 2) {
            return DocumentChangedSource.Reformatting
        }

        // Case when event.contentChanges.length === 1
        const changedText = this.contentChanges[0].text

        if (this.isSingleLine(changedText)) {
            if (changedText === '') {
                return DocumentChangedSource.Deletion
            } else if (this.isEnterKey(changedText)) {
                return DocumentChangedSource.EnterKey
            } else if (this.isTabKey(changedText)) {
                return DocumentChangedSource.TabKey
            } else if (this.isUserTypingSpecialChar(changedText)) {
                return DocumentChangedSource.SpecialCharsKey
            } else if (changedText.length === 1) {
                return DocumentChangedSource.RegularKey
            } else if (new RegExp('^[ ]+$').test(changedText)) {
                // single line && single place reformat should consist of space chars only
                return DocumentChangedSource.Reformatting
            } else if (new RegExp('^[\\S]+$').test(changedText) && !isCloud9()) {
                // match single word only, which is general case for intellisense suggestion, it's still possible intllisense suggest
                // multi-words code snippets
                return DocumentChangedSource.IntelliSense
            } else {
                return isCloud9() ? DocumentChangedSource.RegularKey : DocumentChangedSource.Unknown
            }
        }

        // Won't trigger cwspr on multi-line changes
        return DocumentChangedSource.Unknown
    }
}

export enum DocumentChangedSource {
    SpecialCharsKey = 'SpecialCharsKey',
    RegularKey = 'RegularKey',
    TabKey = 'TabKey',
    EnterKey = 'EnterKey',
    IntelliSense = 'IntelliSense',
    Reformatting = 'Reformatting',
    Deletion = 'Deletion',
    Unknown = 'Unknown',
}
