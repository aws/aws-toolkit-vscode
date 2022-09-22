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

const performance = globalThis.performance ?? require('perf_hooks').performance

/**
 * This class is for CodeWhisperer auto trigger
 */
export class DocumentChangedHandler {
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

    static #instance: DocumentChangedHandler

    public static get instance() {
        return (this.#instance ??= new this())
    }

    async documentChanged(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ): Promise<void> {
        try {
            console.log(event)
            console.log(event.contentChanges[0].text)
            console.log(event.contentChanges.length)

            if (!config.isAutomatedTriggerEnabled) return

            // Skip when output channel gains focus and invoke
            if (editor.document.languageId === 'Log') return

            // Pause automated trigger when typed input matches recommendation prefix for inline suggestion
            if (InlineCompletion.instance.isTypeaheadInProgress) return

            // Time duration between 2 invocations should be greater than the threshold
            // This threshold does not applies to Enter | SpecialCharacters type auto trigger.
            const duration = Math.floor((performance.now() - RecommendationHandler.instance.lastInvocationTime) / 1000)
            if (duration < CodeWhispererConstants.invocationTimeIntervalThreshold) return

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
            const changedSource = this.getDocumentChangedType(event)?.checkChangeSource()
            switch (changedSource) {
                case DocumentChangedSource.EnterKey: {
                    this.keyStrokeCount += 1
                    triggerType = 'Enter'
                    break
                }
                case DocumentChangedSource.UserTypingSpecialChars: {
                    this.keyStrokeCount += 1
                    triggerType = 'SpecialCharacters'
                    break
                }
                case DocumentChangedSource.IntelliSense: {
                    this.keyStrokeCount += 1
                    triggerType = 'IntelliSenseAcceptance'
                    break
                }
                case DocumentChangedSource.UserTypingRegular: {
                    this.keyStrokeCount += 1
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

    getDocumentChangedType(event: vscode.TextDocumentChangeEvent): DocumentChangedType | undefined {
        const contentChanges = event.contentChanges
        if (contentChanges.length == 1) return new SingleChange(contentChanges)
        if (contentChanges.length > 1) return new MultiChange(contentChanges)
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

abstract class DocumentChangedType {
    protected contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>

    constructor(contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        this.contentChanges = contentChanges
    }

    abstract checkChangeSource(): DocumentChangedSource

    static isEnterKey(str: string): boolean {
        return str[0] === '\n' && str.substring(1).trim().length === 0
    }

    static isUserTypingSpecialChar(str: string): boolean {
        const specialChars = new Map<string, string>([
            ['(', ')'],
            ['[', ']'],
            ['{', '}'],
            [':', ':'],
        ])
        if (specialChars.has(str[0])) {
            const substr = str.substring(1)
            // TODO: improve here with matching closing brackets
            return substr.length === 0 || substr.length === 1
        }

        return false
    }

    static isSingleLine(str: string): boolean {
        let newLineCounts = 0
        for (const ch of str) {
            if (ch === '\n') newLineCounts += 1
        }

        if (newLineCounts > 1) return false
        if (newLineCounts === 1 && str[str.length - 1] !== '\n') return false
        return true
    }
}

class SingleChange extends DocumentChangedType {
    constructor(contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        super(contentChanges)
    }

    override checkChangeSource(): DocumentChangedSource {
        const changedText = this.contentChanges[0].text

        // have to check isEnteyKey first, otherwise it will be considered as multi line change
        if (DocumentChangedType.isEnterKey(changedText)) {
            return DocumentChangedSource.EnterKey
        }
        if (DocumentChangedType.isSingleLine(changedText)) {
            if (changedText === '') {
                return DocumentChangedSource.Deletion
            } else if (changedText.trim() === '') {
                return DocumentChangedSource.UserTypingTab
            } else if (DocumentChangedType.isUserTypingSpecialChar(changedText)) {
                return DocumentChangedSource.UserTypingSpecialChars
            } else if (changedText.length === 1) {
                return DocumentChangedSource.UserTypingRegular
            } else {
                return DocumentChangedSource.IntelliSense
            }
        }

        return DocumentChangedSource.Multiline
    }
}

class MultiChange extends DocumentChangedType {
    constructor(contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        super(contentChanges)
    }

    override checkChangeSource(): DocumentChangedSource {
        return DocumentChangedSource.Reformatting
    }
}

enum DocumentChangedSource {
    Multiline,
    UserTypingSpecialChars,
    UserTypingRegular,
    UserTypingTab,
    EnterKey,
    IntelliSense,
    Reformatting,
    Deletion,
    Unknown,
}
