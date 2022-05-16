/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConsolasConstants } from '../models/constants'
import { recommendations, telemetryContext } from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { RecommendationDetail } from '../client/consolas'
/**
 * completion provider for intelliSense popup
 */
export function getCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
    const completionItems: vscode.CompletionItem[] = []
    recommendations.response.forEach((recommendation, index) => {
        if (recommendation.content.length > 0) {
            completionItems.push(getCompletionItem(document, position, recommendation, index))
        }
    })
    return completionItems
}

export function getCompletionItem(
    document: vscode.TextDocument,
    position: vscode.Position,
    recommendationDetail: RecommendationDetail,
    recommendationIndex: number
) {
    const line = position.line
    const recommendation = recommendationDetail.content
    const completionItem = new vscode.CompletionItem(recommendation)
    completionItem.insertText = new vscode.SnippetString(recommendation)
    completionItem.documentation = new vscode.MarkdownString().appendCodeblock(recommendation, document.languageId)
    completionItem.kind = vscode.CompletionItemKind.Method
    completionItem.detail = ConsolasConstants.completionDetail
    completionItem.keepWhitespace = true
    completionItem.label = getLabel(recommendation)
    completionItem.preselect = true
    completionItem.sortText = String(recommendationIndex + 1).padStart(10, '0')
    let languageId = document.languageId
    languageId = languageId === ConsolasConstants.typescript ? ConsolasConstants.javascript : languageId
    const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
    completionItem.command = {
        command: 'aws.consolas.accept',
        title: 'On acceptance',
        arguments: [
            line,
            recommendationIndex,
            recommendation,
            recommendations.requestId,
            telemetryContext.triggerType,
            telemetryContext.completionType,
            languageContext.language,
        ],
    }
    return completionItem
}

export function getLabel(recommendation: string): string {
    return recommendation.slice(0, ConsolasConstants.labelLength) + '..'
}
