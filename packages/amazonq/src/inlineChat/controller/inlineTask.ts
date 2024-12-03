/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import type { CodeReference } from 'aws-core-vscode/amazonq'
import type { InlineChatEvent } from 'aws-core-vscode/codewhisperer'
import type { Decorations } from '../decorations/inlineDecorator'
import { computeDecorations } from '../decorations/computeDecorations'
import { extractLanguageNameFromFile } from 'aws-core-vscode/codewhispererChat'
import { textDocumentUtil } from 'aws-core-vscode/shared'

interface TextToInsert {
    type: 'insertion'
    replacementText: string
    range: vscode.Range
}

interface TextToDelete {
    type: 'deletion'
    originalText: string
    range: vscode.Range
}

interface DiffBlock {
    originalText: string
    replacementText: string
    range: vscode.Range
}

export type TextDiff = TextToInsert | TextToDelete

export enum TaskState {
    Idle = 'Idle',
    InProgress = 'InProgress',
    WaitingForDecision = 'WaitingForDecision',
    Complete = 'Complete',
    Error = 'Error',
}

export class InlineTask {
    public state: TaskState = TaskState.Idle
    public diff: TextDiff[] = []
    public decorations: Decorations | undefined
    public diffBlock: DiffBlock[] = []
    public codeReferences: CodeReference[] = []
    public selectedText: string
    public languageName: string | undefined

    public partialSelectedText: string | undefined
    public partialSelectedTextRight: string | undefined

    public previouseDiff: TextDiff[] | undefined
    public selectedRange: vscode.Range
    public inProgressReplacement: string | undefined
    public replacement: string | undefined

    // Telemetry fields
    public requestId?: string
    public responseStartLatency?: number
    public responseEndLatency?: number

    constructor(
        public query: string,
        public document: vscode.TextDocument,
        selection: vscode.Selection
    ) {
        this.selectedRange = textDocumentUtil.expandSelectionToFullLines(document, selection)
        this.selectedText = document.getText(this.selectedRange)
        this.languageName = extractLanguageNameFromFile(document)
    }

    public revertDiff(): void {
        this.diff = []
        this.decorations = {
            linesAdded: [],
            linesRemoved: [],
        }
    }

    public removeDiffChangeByRange(range: vscode.Range): void {
        if (this.diff) {
            this.diff = this.diff.filter((change) => !change.range.isEqual(range))
        }
    }

    public updateDecorations(): void {
        const isEmpty =
            !this.decorations ||
            (this.decorations?.linesAdded?.length === 0 && this.decorations?.linesRemoved?.length === 0)

        if (isEmpty) {
            return
        }
        const updatedDecorations = computeDecorations(this)
        this.decorations = updatedDecorations
    }

    public updateDiff(affectedRange: vscode.Range, deletedLines: number) {
        const diffsAfter = this.diff.filter((edit) => edit.range.start.isAfter(affectedRange.end))
        for (const diff of diffsAfter) {
            diff.range = new vscode.Range(
                diff.range.start.translate(-deletedLines),
                diff.range.end.translate(-deletedLines)
            )
        }
    }

    // Telemetry methods
    public get numSelectedLines() {
        return this.selectedText.split('\n').length
    }

    public get inputLength() {
        return this.query.length
    }

    public inlineChatEventBase() {
        let numSuggestionAddChars = 0
        let numSuggestionAddLines = 0
        let numSuggestionDelChars = 0
        let numSuggestionDelLines = 0

        for (const diff of this.diff) {
            if (diff.type === 'insertion') {
                numSuggestionAddChars += diff.replacementText.length
                numSuggestionAddLines += diff.range.end.line - diff.range.start.line + 1
            } else {
                numSuggestionDelChars += diff.originalText.length
                numSuggestionDelLines += diff.range.end.line - diff.range.start.line + 1
            }
        }

        const programmingLanguage = this.languageName
            ? {
                  languageName: this.languageName,
              }
            : undefined

        const event: Partial<InlineChatEvent> = {
            requestId: this.requestId,
            timestamp: new Date(),
            inputLength: this.inputLength,
            numSelectedLines: this.numSelectedLines,
            codeIntent: true,
            responseStartLatency: this.responseStartLatency,
            responseEndLatency: this.responseEndLatency,
            numSuggestionAddChars,
            numSuggestionAddLines,
            numSuggestionDelChars,
            numSuggestionDelLines,
            programmingLanguage,
        }
        return event
    }

    public isActiveState() {
        return !(this.state === TaskState.Complete || this.state === TaskState.Error)
    }
}
