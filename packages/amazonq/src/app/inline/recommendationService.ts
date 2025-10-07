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
    LogInlineCompletionSessionResultsParams,
} from '@aws/language-server-runtimes/protocol'
import { CancellationToken, InlineCompletionContext, Position, TextDocument, commands } from 'vscode'
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
import { getLogger } from 'aws-core-vscode/shared'
import { DocumentEventListener } from './documentEventListener'
import { getOpenFilesInWindow } from 'aws-core-vscode/utils'
import { asyncCallWithTimeout } from '../../util/timeoutUtil'
import { extractFileContextInNotebooks } from './notebookUtil'
import { EditSuggestionState } from './editSuggestionState'

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
        documentEventListener: DocumentEventListener,
        options: GetAllRecommendationsOptions = { emitTelemetry: true, showUi: true }
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
        const openTabs = await getOpenFilesInWindow()
        let request: InlineCompletionWithReferencesParams = {
            textDocument: {
                uri: document.uri.toString(),
            },
            position,
            context,
            documentChangeParams: documentChangeParams,
            openTabFilepaths: openTabs,
        }
        if (options.editsStreakToken) {
            request = { ...request, partialResultToken: options.editsStreakToken }
        }
        if (document.uri.scheme === 'vscode-notebook-cell') {
            request.fileContextOverride = extractFileContextInNotebooks(document, position)
        }
        const requestStartTime = Date.now()
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
            const t0 = Date.now()

            // Best effort estimate of deletion
            const isTriggerByDeletion = documentEventListener.isLastEventDeletion(document.uri.fsPath)

            const ps: Promise<InlineCompletionListWithReferences>[] = []
            /**
             * IsTriggerByDeletion is to prevent user deletion invoking Completions.
             * PartialResultToken is not a hack for now since only Edits suggestion use partialResultToken across different calls of [getAllRecommendations],
             * Completions use PartialResultToken with single 1 call of [getAllRecommendations].
             * Edits leverage partialResultToken to achieve EditStreak such that clients can pull all continuous suggestions generated by the model within 1 EOS block.
             */
            if (!isTriggerByDeletion && !request.partialResultToken && !EditSuggestionState.isEditSuggestionActive()) {
                const completionPromise: Promise<InlineCompletionListWithReferences> = languageClient.sendRequest(
                    inlineCompletionWithReferencesRequestType.method,
                    request,
                    token
                )
                ps.push(completionPromise)
            }

            /**
             * Though Edit request is sent on keystrokes everytime, the language server will execute the request in a debounced manner so that it won't be immediately executed.
             */
            const editPromise: Promise<InlineCompletionListWithReferences> = languageClient.sendRequest(
                editCompletionRequestType.method,
                request,
                token
            )
            ps.push(editPromise)

            /**
             * First come first serve, ideally we should simply return the first response returned. However there are some caviar here because either
             * (1) promise might be returned early without going through service
             * (2) some users are not enabled with edits suggestion, therefore service will return empty result without passing through the model
             * With the scenarios listed above or others, it's possible that 1 promise will ALWAYS win the race and users will NOT get any suggestion back.
             * This is the hack to return first "NON-EMPTY" response
             */
            let result = await Promise.race(ps)
            if (ps.length > 1 && result.items.length === 0) {
                for (const p of ps) {
                    const r = await p
                    if (r.items.length > 0) {
                        result = r
                    }
                }
            }

            getLogger().info('Received inline completion response from LSP: %O', {
                sessionId: result.sessionId,
                latency: Date.now() - t0,
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

            if (result.items.length > 0 && result.items[0].isInlineEdit === false) {
                if (isTriggerByDeletion) {
                    return []
                }
                // Completion will not be rendered if an edit suggestion has been active for longer than 1 second
                if (EditSuggestionState.isEditSuggestionDisplayingOverOneSecond()) {
                    const session = this.sessionManager.getActiveSession()
                    if (!session) {
                        return []
                    }
                    const params: LogInlineCompletionSessionResultsParams = {
                        sessionId: session.sessionId,
                        completionSessionResult: Object.fromEntries(
                            result.items.map((item) => [
                                item.itemId,
                                {
                                    seen: false,
                                    accepted: false,
                                    discarded: true,
                                },
                            ])
                        ),
                    }
                    languageClient.sendNotification('aws/logInlineCompletionSessionResults', params)
                    this.sessionManager.clear()
                    getLogger().info(
                        'Completion discarded due to active edit suggestion displayed longer than 1 second'
                    )
                    return []
                } else if (EditSuggestionState.isEditSuggestionActive()) {
                    // discard the current edit suggestion if its display time is less than 1 sec
                    await commands.executeCommand('aws.amazonq.inline.rejectEdit', true)
                    getLogger().info('Discarding active edit suggestion displaying less than 1 second')
                }
            }

            TelemetryHelper.instance.setSdkApiCallEndTime()
            TelemetryHelper.instance.setSessionId(result.sessionId)
            if (result.items.length > 0 && result.items[0].itemId !== undefined) {
                TelemetryHelper.instance.setFirstResponseRequestId(result.items[0].itemId as string)
            }
            TelemetryHelper.instance.setFirstSuggestionShowTime()

            const firstCompletionDisplayLatency = Date.now() - requestStartTime
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
                    // getLogger().info(
                    //     'Suggestion type is COMPLETIONS. Start fetching for more items if partialResultToken exists.'
                    // )
                    // this.processRemainingRequests(languageClient, request, result, token).catch((error) => {
                    //     languageClient.warn(`Error when getting suggestions: ${error}`)
                    // })
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

    async processRemainingRequests(
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
