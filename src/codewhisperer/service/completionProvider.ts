/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CodeWhispererConstants } from '../models/constants'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { Recommendation } from '../client/codewhisperer'
import { LicenseUtil } from '../util/licenseUtil'
import { TelemetryHelper } from '../util/telemetryHelper'
import { RecommendationHandler } from './recommendationHandler'
/**
 * completion provider for intelliSense popup
 */
export function getCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
    const completionItems: vscode.CompletionItem[] = []
    RecommendationHandler.instance.recommendations.forEach((recommendation, index) => {
        completionItems.push(getCompletionItem(document, position, recommendation, index))
        RecommendationHandler.instance.setSuggestionState(index, 'Showed')
    })
    return completionItems
}

export function getCompletionItem(
    document: vscode.TextDocument,
    position: vscode.Position,
    recommendationDetail: Recommendation,
    recommendationIndex: number
) {
    const start = RecommendationHandler.instance.startPos
    const range = new vscode.Range(start, start)
    const recommendation = recommendationDetail.content
    const completionItem = new vscode.CompletionItem(recommendation)
    completionItem.insertText = new vscode.SnippetString(recommendation)
    completionItem.documentation = new vscode.MarkdownString().appendCodeblock(recommendation, document.languageId)
    completionItem.kind = vscode.CompletionItemKind.Method
    completionItem.detail = CodeWhispererConstants.completionDetail
    completionItem.keepWhitespace = true
    completionItem.label = getLabel(recommendation)
    completionItem.preselect = true
    completionItem.sortText = String(recommendationIndex + 1).padStart(10, '0')
    completionItem.range = new vscode.Range(start, position)
    let languageId = document.languageId
    languageId = languageId === CodeWhispererConstants.typescript ? CodeWhispererConstants.javascript : languageId
    const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
    let references = undefined
    if (recommendationDetail.references != undefined && recommendationDetail.references.length > 0) {
        references = recommendationDetail.references
        const licenses = [
            ...new Set(references.map(r => `[${r.licenseName}](${LicenseUtil.getLicenseHtml(r.licenseName)})`)),
        ].join(', ')
        completionItem.documentation.appendMarkdown(CodeWhispererConstants.suggestionDetailReferenceText(licenses))
    }
    completionItem.command = {
        command: 'aws.codeWhisperer.accept',
        title: 'On acceptance',
        arguments: [
            range,
            recommendationIndex,
            recommendation,
            RecommendationHandler.instance.requestId,
            RecommendationHandler.instance.sessionId,
            TelemetryHelper.instance.triggerType,
            TelemetryHelper.instance.completionType,
            languageContext.language,
            references,
        ],
    }
    return completionItem
}

export function getLabel(recommendation: string): string {
    return recommendation.slice(0, CodeWhispererConstants.labelLength) + '..'
}
