/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'
import { ConfigurationEntry } from '../models/model'
import { getLogger } from '../../shared/logger'
import { isCloud9 } from '../../shared/extensionUtilities'
import { RecommendationHandler } from './recommendationHandler'
import { CodewhispererAutomatedTriggerType } from '../../shared/telemetry/telemetry'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { ClassifierTrigger } from './classifierTrigger'
import { extractContextForCodeWhisperer } from '../util/editorContext'
import { RecommendationService } from './recommendationService'

const performance = globalThis.performance ?? require('perf_hooks').performance

/**
 * This class is for CodeWhisperer auto trigger
 */
export class KeyStrokeHandler {
    /**
     * Special character which automated triggers codewhisperer
     */
    public specialChar: string
    /**
     * Key stroke count for automated trigger
     */

    private idleTriggerTimer?: NodeJS.Timer

    public lastInvocationTime?: number

    constructor() {
        this.specialChar = ''
    }

    static #instance: KeyStrokeHandler

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public startIdleTimeTriggerTimer(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ) {
        if (this.idleTriggerTimer) {
            clearInterval(this.idleTriggerTimer)
            this.idleTriggerTimer = undefined
        }
        if (!this.shouldTriggerIdleTime()) {
            return
        }
        this.idleTriggerTimer = setInterval(() => {
            const duration = (performance.now() - RecommendationHandler.instance.lastInvocationTime) / 1000
            if (duration < CodeWhispererConstants.invocationTimeIntervalThreshold) {
                return
            }

            this.invokeAutomatedTrigger('IdleTime', editor, client, config, event)
                .catch(e => {
                    getLogger().error('invokeAutomatedTrigger failed: %s', (e as Error).message)
                })
                .finally(() => {
                    if (this.idleTriggerTimer) {
                        clearInterval(this.idleTriggerTimer)
                        this.idleTriggerTimer = undefined
                    }
                })
        }, CodeWhispererConstants.idleTimerPollPeriod)
    }

    public shouldTriggerIdleTime(): boolean {
        if (isCloud9() && RecommendationService.instance.isRunning) {
            return false
        }
        if (isInlineCompletionEnabled() && RecommendationService.instance.isRunning) {
            return false
        }
        return true
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

            // In Cloud9, do not auto trigger when
            // 1. The input is from IntelliSense acceptance event
            // 2. The input is from copy and paste some code
            // event.contentChanges[0].text.length > 1 is a close estimate of 1 and 2
            if (isCloud9() && event.contentChanges.length > 0 && event.contentChanges[0].text.length > 1) {
                return
            }

            const { rightFileContent } = extractContextForCodeWhisperer(editor)
            const rightContextLines = rightFileContent.split(/\r?\n/)
            const rightContextAtCurrentLine = rightContextLines[0]
            // we do not want to trigger when there is immediate right context on the same line
            // with "}" being an exception because of IDE auto-complete
            if (
                rightContextAtCurrentLine.length &&
                !rightContextAtCurrentLine.startsWith(' ') &&
                rightContextAtCurrentLine.trim() !== '}' &&
                rightContextAtCurrentLine.trim() !== ')'
            ) {
                return
            }

            let triggerType: CodewhispererAutomatedTriggerType | undefined
            const changedSource = new DefaultDocumentChangedType(event.contentChanges).checkChangeSource()

            switch (changedSource) {
                case DocumentChangedSource.EnterKey: {
                    triggerType = 'Enter'
                    break
                }
                case DocumentChangedSource.SpecialCharsKey: {
                    triggerType = 'SpecialCharacters'
                    break
                }
                case DocumentChangedSource.RegularKey: {
                    triggerType = ClassifierTrigger.instance.shouldTriggerFromClassifier(event, editor, triggerType)
                        ? 'Classifier'
                        : undefined
                    break
                }
                default: {
                    break
                }
            }

            if (triggerType) {
                await this.invokeAutomatedTrigger(triggerType, editor, client, config, event)
            }
        } catch (error) {
            getLogger().verbose(`Automated Trigger Exception : ${error}`)
        }
    }

    async invokeAutomatedTrigger(
        autoTriggerType: CodewhispererAutomatedTriggerType,
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry,
        event: vscode.TextDocumentChangeEvent
    ): Promise<void> {
        if (!editor) {
            return
        }
        // RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
        await RecommendationService.instance.generateRecommendation(
            client,
            editor,
            'AutoTrigger',
            config,
            autoTriggerType
        )
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
    Reformatting = 'Reformatting',
    Deletion = 'Deletion',
    Unknown = 'Unknown',
}
