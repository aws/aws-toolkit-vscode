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
import { AuthUtil, CodeWhispererStatusBarManager } from 'aws-core-vscode/codewhisperer'
import { TelemetryHelper } from './telemetryHelper'
import { ICursorUpdateRecorder } from './cursorUpdateManager'
import { globals, getLogger } from 'aws-core-vscode/shared'

export interface GetAllRecommendationsOptions {
    emitTelemetry?: boolean
    showUi?: boolean
}

export class RecommendationService {
    constructor(
        private readonly sessionManager: SessionManager,
        // uncomment the below line to re-enable generating message
        // private readonly inlineGeneratingMessage: InlineGeneratingMessage,
        private cursorUpdateRecorder?: ICursorUpdateRecorder
    ) {}
    /**
     * Set the recommendation service
     */
    public setCursorUpdateRecorder(recorder: ICursorUpdateRecorder): void {
        this.cursorUpdateRecorder = recorder
    }

    async getAllRecommendations(
        languageClient: LanguageClient,
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken,
        isAutoTrigger: boolean,
        options: GetAllRecommendationsOptions = { emitTelemetry: true, showUi: true }
    ) {
        // Record that a regular request is being made
        this.cursorUpdateRecorder?.recordCompletionRequest()

        const request: InlineCompletionWithReferencesParams = {
            textDocument: {
                uri: document.uri.toString(),
            },
            position,
            context,
        }
        const requestStartTime = globals.clock.Date.now()
        const statusBar = CodeWhispererStatusBarManager.instance

        // Only track telemetry if enabled
        TelemetryHelper.instance.setInvokeSuggestionStartTime()
        TelemetryHelper.instance.setPreprocessEndTime()
        TelemetryHelper.instance.setSdkApiCallStartTime()

        try {
            // Show UI indicators only if UI is enabled
            if (options.showUi) {
                // uncomment the below line to re-enable generating message
                // await this.inlineGeneratingMessage.showGenerating(context.triggerKind)
                await statusBar.setLoading()
            }

            // Handle first request
            getLogger().info('Sending inline completion request: %O', {
                method: inlineCompletionWithReferencesRequestType.method,
                request: {
                    textDocument: request.textDocument,
                    position: request.position,
                    context: request.context,
                },
            })
            let result: InlineCompletionListWithReferences = await languageClient.sendRequest(
                inlineCompletionWithReferencesRequestType.method,
                request,
                token
            )
            getLogger().info('Received inline completion response: %O', {
                sessionId: result.sessionId,
                itemCount: result.items?.length || 0,
                items: result.items?.map((item) => ({
                    itemId: item.itemId,
                    insertText:
                        (typeof item.insertText === 'string' ? item.insertText : String(item.insertText))?.substring(
                            0,
                            50
                        ) + '...',
                })),
            })

            TelemetryHelper.instance.setSdkApiCallEndTime()
            TelemetryHelper.instance.setSessionId(result.sessionId)
            if (result.items.length > 0 && result.items[0].itemId !== undefined) {
                TelemetryHelper.instance.setFirstResponseRequestId(result.items[0].itemId as string)
            }
            TelemetryHelper.instance.setFirstSuggestionShowTime()

            const firstCompletionDisplayLatency = globals.clock.Date.now() - requestStartTime
            this.sessionManager.startSession(
                result.sessionId,
                result.items,
                requestStartTime,
                position,
                firstCompletionDisplayLatency
            )

            // If there are more results to fetch, handle them in the background
            try {
                while (result.partialResultToken) {
                    const paginatedRequest = { ...request, partialResultToken: result.partialResultToken }
                    result = await languageClient.sendRequest(
                        inlineCompletionWithReferencesRequestType.method,
                        paginatedRequest,
                        token
                    )
                    this.sessionManager.updateSessionSuggestions(result.items)
                }
            } catch (error) {
                languageClient.warn(`Error when getting suggestions: ${error}`)
            }

            // Close session and finalize telemetry regardless of pagination path
            this.sessionManager.closeSession()
            TelemetryHelper.instance.setAllPaginationEndTime()
            options.emitTelemetry && TelemetryHelper.instance.tryRecordClientComponentLatency()
        } catch (error: any) {
            getLogger().error('Error getting recommendations: %O', error)
            // bearer token expired
            if (error.data && error.data.awsErrorCode === 'E_AMAZON_Q_CONNECTION_EXPIRED') {
                // ref: https://github.com/aws/aws-toolkit-vscode/blob/amazonq/v1.74.0/packages/core/src/codewhisperer/service/inlineCompletionService.ts#L104
                // show re-auth once if connection expired
                if (AuthUtil.instance.isConnectionExpired()) {
                    await AuthUtil.instance.notifyReauthenticate(isAutoTrigger)
                } else {
                    // get a new bearer token, if this failed, the connection will be marked as expired.
                    // new tokens will be synced per 10 seconds in auth.startTokenRefreshInterval
                    await AuthUtil.instance.getBearerToken()
                }
            }
            return []
        } finally {
            // Remove all UI indicators if UI is enabled
            if (options.showUi) {
                // uncomment the below line to re-enable generating message
                // this.inlineGeneratingMessage.hideGenerating()
                void statusBar.refreshStatusBar() // effectively "stop loading"
            }
        }
    }
}
