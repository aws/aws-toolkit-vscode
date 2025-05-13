/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    InlineCompletionListWithReferences,
    InlineCompletionWithReferencesParams,
    inlineCompletionWithReferencesRequestType,
} from '@aws/language-server-runtimes/protocol'
import { CancellationToken, InlineCompletionContext, Position, TextDocument } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { SessionManager } from './sessionManager'
import { InlineGeneratingMessage } from './inlineGeneratingMessage'
import { CodeWhispererStatusBarManager } from 'aws-core-vscode/codewhisperer'
import { TelemetryHelper } from './telemetryHelper'

export class RecommendationService {
    constructor(
        private readonly sessionManager: SessionManager,
        private readonly inlineGeneratingMessage: InlineGeneratingMessage
    ) {}

    async getAllRecommendations(
        languageClient: LanguageClient,
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ) {
        const request: InlineCompletionWithReferencesParams = {
            textDocument: {
                uri: document.uri.toString(),
            },
            position,
            context,
        }
        const requestStartTime = Date.now()
        const statusBar = CodeWhispererStatusBarManager.instance
        TelemetryHelper.instance.setInvokeSuggestionStartTime()
        TelemetryHelper.instance.setPreprocessEndTime()
        TelemetryHelper.instance.setSdkApiCallStartTime()

        try {
            // Show UI indicators that we are generating suggestions
            await this.inlineGeneratingMessage.showGenerating(context.triggerKind)
            await statusBar.setLoading()

            // Handle first request
            const firstResult: InlineCompletionListWithReferences = await languageClient.sendRequest(
                inlineCompletionWithReferencesRequestType as any,
                request,
                token
            )

            // Set telemetry data for the first response
            TelemetryHelper.instance.setSdkApiCallEndTime()
            TelemetryHelper.instance.setSessionId(firstResult.sessionId)
            if (firstResult.items.length > 0) {
                TelemetryHelper.instance.setFirstResponseRequestId(firstResult.items[0].itemId)
            }
            TelemetryHelper.instance.setFirstSuggestionShowTime()

            const firstCompletionDisplayLatency = Date.now() - requestStartTime
            this.sessionManager.startSession(
                firstResult.sessionId,
                firstResult.items,
                requestStartTime,
                firstCompletionDisplayLatency
            )

            if (firstResult.partialResultToken) {
                // If there are more results to fetch, handle them in the background
                this.processRemainingRequests(languageClient, request, firstResult, token).catch((error) => {
                    languageClient.warn(`Error when getting suggestions: ${error}`)
                })
            } else {
                this.sessionManager.closeSession()

                // No more results to fetch, mark pagination as complete
                TelemetryHelper.instance.setAllPaginationEndTime()
                TelemetryHelper.instance.tryRecordClientComponentLatency()
            }
        } finally {
            // Remove all UI indicators of message generation since we are done
            this.inlineGeneratingMessage.hideGenerating()
            void statusBar.refreshStatusBar() // effectively "stop loading"
        }
    }

    private async processRemainingRequests(
        languageClient: LanguageClient,
        initialRequest: InlineCompletionWithReferencesParams,
        firstResult: InlineCompletionListWithReferences,
        token: CancellationToken
    ): Promise<void> {
        let nextToken = firstResult.partialResultToken
        while (nextToken) {
            const request = { ...initialRequest, partialResultToken: nextToken }
            const result: InlineCompletionListWithReferences = await languageClient.sendRequest(
                inlineCompletionWithReferencesRequestType as any,
                request,
                token
            )
            this.sessionManager.updateSessionSuggestions(result.items)
            nextToken = result.partialResultToken
        }

        this.sessionManager.closeSession()

        // All pagination requests completed
        TelemetryHelper.instance.setAllPaginationEndTime()
        TelemetryHelper.instance.tryRecordClientComponentLatency()
    }
}
