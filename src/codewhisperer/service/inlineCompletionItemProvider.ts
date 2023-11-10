/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode, { Position } from 'vscode'
import { getPrefixSuffixOverlap } from '../util/commonUtil'
import { TelemetryHelper } from '../util/telemetryHelper'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { ReferenceInlineProvider } from './referenceInlineProvider'
import { ImportAdderProvider } from './importAdderProvider'
import { application } from '../util/codeWhispererApplication'
import { CWRecommendationEntry } from '../models/model'
import { CWSessionManager } from './sessionManager'

export class CWInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private activeItemIndex: number | undefined
    private nextMove: number
    private recommendations: CWRecommendationEntry[]
    private requestId: string
    private startPos: Position
    private nextToken: string

    private _onDidShow: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidShow: vscode.Event<void> = this._onDidShow.event

    public constructor(
        itemIndex: number | undefined,
        firstMove: number,
        recommendations: CWRecommendationEntry[],
        requestId: string,
        startPos: Position,
        nextToken: string
    ) {
        this.activeItemIndex = itemIndex
        this.nextMove = firstMove
        this.recommendations = recommendations
        this.requestId = requestId
        this.startPos = startPos
        this.nextToken = nextToken
    }

    get getActiveItemIndex() {
        return this.activeItemIndex
    }

    public clearActiveItemIndex() {
        this.activeItemIndex = undefined
    }

    // iterate suggestions and stop at index 0 or index len - 1
    private getIteratingIndexes() {
        const len = this.recommendations.length
        const startIndex = this.activeItemIndex ? this.activeItemIndex : 0
        const index = []
        if (this.nextMove === 0) {
            for (let i = 0; i < len; i++) {
                index.push((startIndex + i) % len)
            }
        } else if (this.nextMove === -1) {
            for (let i = startIndex - 1; i >= 0; i--) {
                index.push(i)
            }
            index.push(startIndex)
        } else {
            for (let i = startIndex + 1; i < len; i++) {
                index.push(i)
            }
            index.push(startIndex)
        }
        return index
    }

    truncateOverlapWithRightContext(document: vscode.TextDocument, suggestion: string, pos: vscode.Position): string {
        const trimmedSuggestion = suggestion.trim()
        // limit of 5000 for right context matching
        const rightContext = document.getText(new vscode.Range(pos, document.positionAt(document.offsetAt(pos) + 5000)))
        const overlap = getPrefixSuffixOverlap(trimmedSuggestion, rightContext.trim())
        const overlapIndex = suggestion.lastIndexOf(overlap)
        if (overlapIndex >= 0) {
            const truncated = suggestion.slice(0, overlapIndex)
            return truncated.trim().length ? truncated : ''
        } else {
            return suggestion
        }
    }

    getInlineCompletionItem(
        document: vscode.TextDocument,
        r: CWRecommendationEntry,
        start: vscode.Position,
        end: vscode.Position,
        index: number,
        prefix: string
    ): vscode.InlineCompletionItem | undefined {
        if (!r.recommendation.content.startsWith(prefix)) {
            return undefined
        }
        const truncatedSuggestion = this.truncateOverlapWithRightContext(document, r.recommendation.content, end)
        const session = CWSessionManager.currentSession()
        if (truncatedSuggestion.length === 0) {
            if (session.recommendations[index].suggestionState !== 'Showed') {
                session.recommendations[index].suggestionState = 'Discard'
            }
            return undefined
        }
        return {
            insertText: truncatedSuggestion,
            range: new vscode.Range(start, end),
            command: {
                command: 'aws.codeWhisperer.accept',
                title: 'On acceptance',
                arguments: [
                    new vscode.Range(start, end),
                    index,
                    truncatedSuggestion,
                    this.requestId,
                    session.sessionId,
                    TelemetryHelper.instance.triggerType,
                    session.recommendations[index].completionType,
                    runtimeLanguageContext.getLanguageContext(document.languageId).language,
                    r.recommendation.references,
                ],
            },
        }
    }

    // the returned completion items will always only contain one valid item
    // this is to trace the current index of visible completion item
    // so that reference tracker can show
    // This hack can be removed once inlineCompletionAdditions API becomes public
    provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        if (position.line < 0 || position.isBefore(this.startPos)) {
            application()._clearCodeWhispererUIListener.fire()
            this.activeItemIndex = undefined
            return
        }

        // There's a chance that the startPos is no longer valid in the current document (e.g.
        // when CodeWhisperer got triggered by 'Enter', the original startPos is with indentation
        // but then this indentation got removed by VSCode when another new line is inserted,
        // before the code reaches here). In such case, we need to update the startPos to be a
        // valid one. Otherwise, inline completion which utilizes this position will function
        // improperly.
        const start = document.validatePosition(this.startPos)
        const end = position
        const iteratingIndexes = this.getIteratingIndexes()
        const prefix = document.getText(new vscode.Range(start, end)).replace(/\r\n/g, '\n')
        const session = CWSessionManager.currentSession()
        const matchedCount = session.recommendations.filter(
            r =>
                r.recommendation.content.length > 0 &&
                r.recommendation.content.startsWith(prefix) &&
                r.recommendation.content !== prefix
        ).length
        for (const i of iteratingIndexes) {
            const r = session.recommendations[i]
            const item = this.getInlineCompletionItem(document, r, start, end, i, prefix)
            if (item === undefined) {
                continue
            }
            this.activeItemIndex = i
            session.recommendations[i].suggestionState = 'Showed'
            ReferenceInlineProvider.instance.setInlineReference(
                this.startPos.line,
                r.recommendation.content,
                r.recommendation.references
            )
            ImportAdderProvider.instance.onShowRecommendation(document, this.startPos.line, r.recommendation)
            this.nextMove = 0
            TelemetryHelper.instance.setFirstSuggestionShowTime()
            TelemetryHelper.instance.tryRecordClientComponentLatency()
            this._onDidShow.fire()
            if (matchedCount >= 2 || this.nextToken !== '') {
                const result = [item]
                for (let j = 0; j < matchedCount - 1; j++) {
                    result.push({ insertText: `${item.insertText}${j}`, range: item.range })
                }
                return result
            }
            return [item]
        }
        application()._clearCodeWhispererUIListener.fire()
        this.activeItemIndex = undefined
        return []
    }
}
