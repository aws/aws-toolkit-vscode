/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    InlineCompletionListWithReferences,
    InlineCompletionWithReferencesParams,
    inlineCompletionWithReferencesRequestType,
    TextDocumentContentChangeEvent,
    editCompletionRequestType,
} from '@aws/language-server-runtimes/protocol'
import { CancellationToken, InlineCompletionContext, Position, TextDocument } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { SessionManager } from './sessionManager'
import {
    AuthUtil,
    CodeWhispererConstants,
    CodeWhispererStatusBarManager,
    vsCodeState,
} from 'aws-core-vscode/codewhisperer'
import { TelemetryHelper } from './telemetryHelper'
import { ICursorUpdateRecorder } from './cursorUpdateManager'
import { getLogger, sleep } from 'aws-core-vscode/shared'
import { DocumentEventListener } from './documentEventListener'
import { asyncCallWithTimeout } from '../../util/timeoutUtil'

export interface GetAllRecommendationsOptions {
    emitTelemetry?: boolean
    showUi?: boolean
    editsStreakToken?: number | string
}

export class RecommendationService {
    constructor(
        private readonly sessionManager: SessionManager,
        private cursorUpdateRecorder?: ICursorUpdateRecorder
    ) {}
    /**
     * Set the recommendation service
     */
    public setCursorUpdateRecorder(recorder: ICursorUpdateRecorder): void {
        this.cursorUpdateRecorder = recorder
    }

    async getRecommendationsWithTimeout(
        languageClient: LanguageClient,
        request: InlineCompletionWithReferencesParams,
        token: CancellationToken
    ) {
        const resultPromise: Promise<InlineCompletionListWithReferences> = languageClient.sendRequest(
            inlineCompletionWithReferencesRequestType.method,
            request,
            token
        )
        return await asyncCallWithTimeout<InlineCompletionListWithReferences>(
            resultPromise,
            `${inlineCompletionWithReferencesRequestType.method} time out`,
            CodeWhispererConstants.promiseTimeoutLimit * 1000
        )
    }

    async getAllRecommendations(
        languageClient: LanguageClient,
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken,
        isAutoTrigger: boolean,
        options: GetAllRecommendationsOptions = { emitTelemetry: true, showUi: true },
        documentEventListener: DocumentEventListener
    ) {
        const documentChangeEvent = documentEventListener?.getLastDocumentChangeEvent(document.uri.fsPath)?.event

        // Record that a regular request is being made
        this.cursorUpdateRecorder?.recordCompletionRequest()
        const documentChangeParams = documentChangeEvent
            ? {
                  textDocument: {
                      uri: document.uri.toString(),
                      version: document.version,
                  },
                  contentChanges: documentChangeEvent.contentChanges.map((x) => x as TextDocumentContentChangeEvent),
              }
            : undefined

        let request: InlineCompletionWithReferencesParams = {
            textDocument: {
                uri: document.uri.toString(),
            },
            position,
            context,
            documentChangeParams: documentChangeParams,
        }
        if (options.editsStreakToken) {
            request = { ...request, partialResultToken: options.editsStreakToken }
        }
        const requestStartTime = performance.now()
        const statusBar = CodeWhispererStatusBarManager.instance

        // Only track telemetry if enabled
        TelemetryHelper.instance.setInvokeSuggestionStartTime()
        TelemetryHelper.instance.setPreprocessEndTime()
        TelemetryHelper.instance.setSdkApiCallStartTime()

        try {
            // Show UI indicators only if UI is enabled
            if (options.showUi) {
                await statusBar.setLoading()
            }

            // Handle first request
            getLogger().info('Sending inline completion request: %O', {
                method: inlineCompletionWithReferencesRequestType.method,
                request: {
                    textDocument: request.textDocument,
                    position: request.position,
                    context: request.context,
                    nextToken: request.partialResultToken,
                },
            })
            const t0 = performance.now()

            // yield event loop to let the document listen catch updates
            await sleep(1)
            // prevent user deletion invoking auto trigger
            // this is a best effort estimate of deletion
            const isTriggerByDeletion = documentEventListener.isLastEventDeletion(document.uri.fsPath)

            // const completionPromise: Promise<InlineCompletionListWithReferences> = languageClient.sendRequest(
            //     inlineCompletionWithReferencesRequestType.method,
            //     request,
            //     token
            // )

            const editPromise: Promise<InlineCompletionListWithReferences> = languageClient.sendRequest(
                editCompletionRequestType.method,
                request,
                token
            )

            const p = isTriggerByDeletion ? [editPromise] : [editPromise]
            getLogger().debug('Skip auto trigger of completion when deleting code')

            const result = await Promise.race(p)
            // const result = await editPromise
            // if (p.length > 1 && result.items.length === 0) {
            //     result = await editPromise
            // }

            // const result = await editPromise

            getLogger().info('Received inline completion response from LSP: %O', {
                sessionId: result.sessionId,
                latency: performance.now() - t0,
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

            const firstCompletionDisplayLatency = performance.now() - requestStartTime
            this.sessionManager.startSession(
                result.sessionId,
                result.items,
                requestStartTime,
                position,
                firstCompletionDisplayLatency
            )

            const isInlineEdit = result.items.some((item) => item.isInlineEdit)

            // TODO: question, is it possible that the first request returns empty suggestion but has non-empty next token?
            if (result.partialResultToken) {
                if (!isInlineEdit) {
                    // If the suggestion is COMPLETIONS and there are more results to fetch, handle them in the background
                    getLogger().info(
                        'Suggestion type is COMPLETIONS. Start fetching for more items if partialResultToken exists.'
                    )
                    this.processRemainingRequests(languageClient, request, result, token).catch((error) => {
                        languageClient.warn(`Error when getting suggestions: ${error}`)
                    })
                } else {
                    // Skip fetching for more items if the suggesion is EDITS. If it is EDITS suggestion, only fetching for more
                    // suggestions when the user start to accept a suggesion.
                    // Save editsStreakPartialResultToken for the next EDITS suggestion trigger if user accepts.
                    getLogger().info('Suggestion type is EDITS. Skip fetching for more items.')
                    this.sessionManager.updateActiveEditsStreakToken(result.partialResultToken)
                }
            }
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
                void statusBar.refreshStatusBar() // effectively "stop loading"
            }
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

            const result = await this.getRecommendationsWithTimeout(languageClient, request, token)
            // when pagination is in progress, but user has already accepted or rejected an inline completion
            // then stop pagination
            if (this.sessionManager.getActiveSession() === undefined || vsCodeState.isCodeWhispererEditing) {
                break
            }
            this.sessionManager.updateSessionSuggestions(result.items)
            nextToken = result.partialResultToken
        }

        this.sessionManager.closeSession()

        // refresh inline completion items to render paginated responses
        // All pagination requests completed
        TelemetryHelper.instance.setAllPaginationEndTime()
        TelemetryHelper.instance.tryRecordClientComponentLatency()
    }
}
