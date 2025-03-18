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

export class RecommendationService {
    static #instance: RecommendationService

    public static get instance() {
        return (this.#instance ??= new this())
    }

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

        // Handle first request
        const firstResult: InlineCompletionListWithReferences = await languageClient.sendRequest(
            inlineCompletionWithReferencesRequestType as any,
            request,
            token
        )

        const firstCompletionDisplayLatency = Date.now() - requestStartTime
        SessionManager.instance.startSession(firstResult.sessionId, firstResult.items, firstCompletionDisplayLatency)

        if (firstResult.partialResultToken) {
            // If there are more results to fetch, handle them in the background
            this.processRemainingRequests(languageClient, request, firstResult, token).catch((error) => {
                languageClient.warn(`Error when getting suggestions: ${error}`)
            })
        } else {
            SessionManager.instance.closeSession()
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
            SessionManager.instance.updateSessionSuggestions(result.items)
            nextToken = result.partialResultToken
        }
        SessionManager.instance.closeSession()
    }
}
