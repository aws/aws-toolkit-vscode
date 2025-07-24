/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CancellationToken,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionItemProvider,
    Position,
    TextDocument,
    commands,
    languages,
    Disposable,
    window,
    TextEditor,
    InlineCompletionTriggerKind,
    Range,
} from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import {
    InlineCompletionItemWithReferences,
    LogInlineCompletionSessionResultsParams,
} from '@aws/language-server-runtimes/protocol'
import { SessionManager } from './sessionManager'
import { GetAllRecommendationsOptions, RecommendationService } from './recommendationService'
import {
    CodeWhispererConstants,
    ReferenceHoverProvider,
    ReferenceLogViewProvider,
    ImportAdderProvider,
    CodeSuggestionsState,
    vsCodeState,
    inlineCompletionsDebounceDelay,
    noInlineSuggestionsMsg,
    getDiagnosticsDifferences,
    getDiagnosticsOfCurrentFile,
    toIdeDiagnostics,
} from 'aws-core-vscode/codewhisperer'
import { LineTracker } from './stateTracker/lineTracker'
import { InlineTutorialAnnotation } from './tutorials/inlineTutorialAnnotation'
import { TelemetryHelper } from './telemetryHelper'
import { Experiments, getLogger, sleep } from 'aws-core-vscode/shared'
import { debounce, messageUtils } from 'aws-core-vscode/utils'
import { showEdits } from './EditRendering/imageRenderer'
import { ICursorUpdateRecorder } from './cursorUpdateManager'
import { DocumentEventListener } from './documentEventListener'

export class InlineCompletionManager implements Disposable {
    private disposable: Disposable
    private inlineCompletionProvider: AmazonQInlineCompletionItemProvider
    private languageClient: LanguageClient
    private sessionManager: SessionManager
    private recommendationService: RecommendationService
    private lineTracker: LineTracker

    private inlineTutorialAnnotation: InlineTutorialAnnotation
    private readonly logSessionResultMessageName = 'aws/logInlineCompletionSessionResults'
    private documentEventListener: DocumentEventListener

    constructor(
        languageClient: LanguageClient,
        sessionManager: SessionManager,
        lineTracker: LineTracker,
        inlineTutorialAnnotation: InlineTutorialAnnotation,
        cursorUpdateRecorder?: ICursorUpdateRecorder
    ) {
        this.languageClient = languageClient
        this.sessionManager = sessionManager
        this.lineTracker = lineTracker
        this.recommendationService = new RecommendationService(this.sessionManager, cursorUpdateRecorder)
        this.inlineTutorialAnnotation = inlineTutorialAnnotation
        this.documentEventListener = new DocumentEventListener()
        this.inlineCompletionProvider = new AmazonQInlineCompletionItemProvider(
            languageClient,
            this.recommendationService,
            this.sessionManager,
            this.inlineTutorialAnnotation,
            this.documentEventListener
        )

        this.disposable = languages.registerInlineCompletionItemProvider(
            CodeWhispererConstants.platformLanguageIds,
            this.inlineCompletionProvider
        )
        this.lineTracker.ready()
    }

    public getInlineCompletionProvider(): AmazonQInlineCompletionItemProvider {
        return this.inlineCompletionProvider
    }

    public dispose(): void {
        if (this.disposable) {
            this.disposable.dispose()
            this.lineTracker.dispose()
        }
        if (this.documentEventListener) {
            this.documentEventListener.dispose()
        }
    }

    public registerInlineCompletion() {
        const onInlineAcceptance = async (
            sessionId: string,
            item: InlineCompletionItemWithReferences,
            editor: TextEditor,
            requestStartTime: number,
            startLine: number,
            firstCompletionDisplayLatency?: number
        ) => {
            try {
                vsCodeState.isCodeWhispererEditing = true
                // TODO: also log the seen state for other suggestions in session
                // Calculate timing metrics before diagnostic delay
                const totalSessionDisplayTime = performance.now() - requestStartTime
                await sleep(500)
                const diagnosticDiff = getDiagnosticsDifferences(
                    this.sessionManager.getActiveSession()?.diagnosticsBeforeAccept,
                    getDiagnosticsOfCurrentFile()
                )
                const params: LogInlineCompletionSessionResultsParams = {
                    sessionId: sessionId,
                    completionSessionResult: {
                        [item.itemId]: {
                            seen: true,
                            accepted: true,
                            discarded: false,
                        },
                    },
                    totalSessionDisplayTime: totalSessionDisplayTime,
                    firstCompletionDisplayLatency: firstCompletionDisplayLatency,
                    addedDiagnostics: diagnosticDiff.added.map((it) => toIdeDiagnostics(it)),
                    removedDiagnostics: diagnosticDiff.removed.map((it) => toIdeDiagnostics(it)),
                }
                this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                this.disposable.dispose()
                this.disposable = languages.registerInlineCompletionItemProvider(
                    CodeWhispererConstants.platformLanguageIds,
                    this.inlineCompletionProvider
                )
                if (item.references && item.references.length) {
                    const referenceLog = ReferenceLogViewProvider.getReferenceLog(
                        item.insertText as string,
                        item.references,
                        editor
                    )
                    ReferenceLogViewProvider.instance.addReferenceLog(referenceLog)
                    ReferenceHoverProvider.instance.addCodeReferences(item.insertText as string, item.references)
                }
                if (item.mostRelevantMissingImports?.length) {
                    await ImportAdderProvider.instance.onAcceptRecommendation(editor, item, startLine)
                }
                this.sessionManager.incrementSuggestionCount()
                // clear session manager states once accepted
                this.sessionManager.clear()
            } finally {
                vsCodeState.isCodeWhispererEditing = false
            }
        }
        commands.registerCommand('aws.amazonq.acceptInline', onInlineAcceptance)

        const onInlineRejection = async () => {
            try {
                vsCodeState.isCodeWhispererEditing = true
                if (this.sessionManager.getActiveSession() === undefined) {
                    return
                }
                const requestStartTime = this.sessionManager.getActiveSession()!.requestStartTime
                const totalSessionDisplayTime = performance.now() - requestStartTime
                await commands.executeCommand('editor.action.inlineSuggest.hide')
                // TODO: also log the seen state for other suggestions in session
                this.disposable.dispose()
                this.disposable = languages.registerInlineCompletionItemProvider(
                    CodeWhispererConstants.platformLanguageIds,
                    this.inlineCompletionProvider
                )
                const sessionId = this.sessionManager.getActiveSession()?.sessionId
                const itemId = this.sessionManager.getActiveRecommendation()[0]?.itemId
                if (!sessionId || !itemId) {
                    return
                }
                const params: LogInlineCompletionSessionResultsParams = {
                    sessionId: sessionId,
                    completionSessionResult: {
                        [itemId]: {
                            seen: true,
                            accepted: false,
                            discarded: false,
                        },
                    },
                    totalSessionDisplayTime: totalSessionDisplayTime,
                }
                this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                // clear session manager states once rejected
                this.sessionManager.clear()
            } finally {
                vsCodeState.isCodeWhispererEditing = false
            }
        }
        commands.registerCommand('aws.amazonq.rejectCodeSuggestion', onInlineRejection)
    }
}

export class AmazonQInlineCompletionItemProvider implements InlineCompletionItemProvider {
    private logger = getLogger()
    constructor(
        private readonly languageClient: LanguageClient,
        private readonly recommendationService: RecommendationService,
        private readonly sessionManager: SessionManager,
        private readonly inlineTutorialAnnotation: InlineTutorialAnnotation,
        private readonly documentEventListener: DocumentEventListener
    ) {}

    private readonly logSessionResultMessageName = 'aws/logInlineCompletionSessionResults'
    provideInlineCompletionItems = debounce(
        this._provideInlineCompletionItems.bind(this),
        inlineCompletionsDebounceDelay,
        true
    )

    private async _provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken,
        getAllRecommendationsOptions?: GetAllRecommendationsOptions
    ): Promise<InlineCompletionItem[]> {
        getLogger().info('_provideInlineCompletionItems called with: %O', {
            documentUri: document.uri.toString(),
            position,
            context,
            triggerKind: context.triggerKind === InlineCompletionTriggerKind.Automatic ? 'Automatic' : 'Invoke',
            options: JSON.stringify(getAllRecommendationsOptions),
        })

        // prevent concurrent API calls and write to shared state variables
        if (vsCodeState.isRecommendationsActive) {
            getLogger().info('Recommendations already active, returning empty')
            return []
        }

        if (vsCodeState.isCodeWhispererEditing) {
            getLogger().info('Q is editing, returning empty')
            return []
        }

        const isAutoTrigger = context.triggerKind === InlineCompletionTriggerKind.Automatic
        if (isAutoTrigger && !CodeSuggestionsState.instance.isSuggestionsEnabled()) {
            // return early when suggestions are disabled with auto trigger
            return []
        }

        // yield event loop to let the document listen catch updates
        await sleep(1)
        // prevent user deletion invoking auto trigger
        // this is a best effort estimate of deletion
        if (this.documentEventListener.isLastEventDeletion(document.uri.fsPath)) {
            getLogger().debug('Skip auto trigger when deleting code')
            return []
        }

        let logstr = `GenerateCompletion metadata:\\n`
        try {
            const t0 = performance.now()
            vsCodeState.isRecommendationsActive = true
            // handling previous session
            const prevSession = this.sessionManager.getActiveSession()
            const prevSessionId = prevSession?.sessionId
            const prevItemId = this.sessionManager.getActiveRecommendation()?.[0]?.itemId
            const prevStartPosition = prevSession?.startPosition
            if (prevSession?.triggerOnAcceptance) {
                getAllRecommendationsOptions = {
                    ...getAllRecommendationsOptions,
                    editsStreakToken: prevSession?.editsStreakPartialResultToken,
                }
            }
            const editor = window.activeTextEditor
            if (prevSession && prevSessionId && prevItemId && prevStartPosition) {
                const prefix = document.getText(new Range(prevStartPosition, position))
                const prevItemMatchingPrefix = []
                for (const item of this.sessionManager.getActiveRecommendation()) {
                    // if item is an Edit suggestion, insertText is a diff instead of new code contents, skip the logic to check for prefix.
                    if (item.isInlineEdit) {
                        continue
                    }
                    const text = typeof item.insertText === 'string' ? item.insertText : item.insertText.value
                    if (text.startsWith(prefix) && position.isAfterOrEqual(prevStartPosition)) {
                        item.command = {
                            command: 'aws.amazonq.acceptInline',
                            title: 'On acceptance',
                            arguments: [
                                prevSessionId,
                                item,
                                editor,
                                prevSession?.requestStartTime,
                                position.line,
                                prevSession?.firstCompletionDisplayLatency,
                            ],
                        }
                        item.range = new Range(prevStartPosition, position)
                        prevItemMatchingPrefix.push(item as InlineCompletionItem)
                    }
                }
                // re-use previous suggestions as long as new typed prefix matches
                if (prevItemMatchingPrefix.length > 0) {
                    logstr += `- not call LSP and reuse previous suggestions that match user typed characters
                    - duration between trigger to completion suggestion is displayed ${performance.now() - t0}`
                    return prevItemMatchingPrefix
                }
                getLogger().debug(`Auto rejecting suggestions from previous session`)
                // if no such suggestions, report the previous suggestion as Reject
                const params: LogInlineCompletionSessionResultsParams = {
                    sessionId: prevSessionId,
                    completionSessionResult: {
                        [prevItemId]: {
                            seen: true,
                            accepted: false,
                            discarded: false,
                        },
                    },
                    totalSessionDisplayTime: performance.now() - prevSession.requestStartTime,
                }
                this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                this.sessionManager.clear()
            }

            // tell the tutorial that completions has been triggered
            await this.inlineTutorialAnnotation.triggered(context.triggerKind)

            TelemetryHelper.instance.setInvokeSuggestionStartTime()
            TelemetryHelper.instance.setTriggerType(context.triggerKind)

            const t1 = performance.now()

            await this.recommendationService.getAllRecommendations(
                this.languageClient,
                document,
                position,
                context,
                token,
                isAutoTrigger,
                getAllRecommendationsOptions,
                this.documentEventListener.getLastDocumentChangeEvent(document.uri.fsPath)?.event
            )
            // get active item from session for displaying
            const items = this.sessionManager.getActiveRecommendation()
            const itemId = this.sessionManager.getActiveRecommendation()?.[0]?.itemId

            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const itemLog = items[0] ? `${items[0].insertText.toString()}` : `no suggestion`

            const t2 = performance.now()

            logstr += `- number of suggestions: ${items.length}
- sessionId: ${this.sessionManager.getActiveSession()?.sessionId}
- first suggestion content (next line):
${itemLog}
- duration between trigger to before sending LSP call: ${t1 - t0}ms
- duration between trigger to after receiving LSP response: ${t2 - t0}ms
- duration between before sending LSP call to after receving LSP response: ${t2 - t1}ms
`
            const session = this.sessionManager.getActiveSession()

            // Show message to user when manual invoke fails to produce results.
            if (items.length === 0 && context.triggerKind === InlineCompletionTriggerKind.Invoke) {
                void messageUtils.showTimedMessage(noInlineSuggestionsMsg, 2000)
            }

            if (!session || !items.length || !editor) {
                logstr += `Failed to produce inline suggestion results. Received ${items.length} items from service`
                return []
            }

            const cursorPosition = document.validatePosition(position)

            if (position.isAfter(editor.selection.active)) {
                const params: LogInlineCompletionSessionResultsParams = {
                    sessionId: session.sessionId,
                    completionSessionResult: {
                        [itemId]: {
                            seen: false,
                            accepted: false,
                            discarded: true,
                        },
                    },
                }
                this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                this.sessionManager.clear()
                logstr += `- cursor moved behind trigger position. Discarding suggestion...`
                return []
            }

            // delay the suggestion rendeing if user is actively typing
            // see https://github.com/aws/aws-toolkit-vscode/commit/a537602a96f498f372ed61ec9d82cf8577a9d854
            for (let i = 0; i < 30; i++) {
                const lastDocumentChange = this.documentEventListener.getLastDocumentChangeEvent(document.uri.fsPath)
                if (
                    lastDocumentChange &&
                    performance.now() - lastDocumentChange.timestamp < CodeWhispererConstants.inlineSuggestionShowDelay
                ) {
                    await sleep(CodeWhispererConstants.showRecommendationTimerPollPeriod)
                } else {
                    break
                }
            }

            // the user typed characters from invoking suggestion cursor position to receiving suggestion position
            const typeahead = document.getText(new Range(position, editor.selection.active))

            const itemsMatchingTypeahead = []

            for (const item of items) {
                if (item.isInlineEdit) {
                    // Check if Next Edit Prediction feature flag is enabled
                    if (Experiments.instance.get('amazonqLSPNEP', true)) {
                        await showEdits(item, editor, session, this.languageClient, this)
                        logstr += `- duration between trigger to edits suggestion is displayed: ${performance.now() - t0}ms`
                    }
                    return []
                }

                item.insertText = typeof item.insertText === 'string' ? item.insertText : item.insertText.value
                if (item.insertText.startsWith(typeahead)) {
                    item.command = {
                        command: 'aws.amazonq.acceptInline',
                        title: 'On acceptance',
                        arguments: [
                            session.sessionId,
                            item,
                            editor,
                            session.requestStartTime,
                            cursorPosition.line,
                            session.firstCompletionDisplayLatency,
                        ],
                    }
                    item.range = new Range(cursorPosition, cursorPosition)
                    itemsMatchingTypeahead.push(item)
                }
            }

            // report discard if none of suggestions match typeahead
            if (itemsMatchingTypeahead.length === 0) {
                const params: LogInlineCompletionSessionResultsParams = {
                    sessionId: session.sessionId,
                    completionSessionResult: {
                        [itemId]: {
                            seen: false,
                            accepted: false,
                            discarded: true,
                        },
                    },
                }
                this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                this.sessionManager.clear()
                logstr += `- suggestion does not match user typeahead from insertion position. Discarding suggestion...`
                return []
            }

            this.sessionManager.updateCodeReferenceAndImports()
            // suggestions returned here will be displayed on screen
            logstr += `- duration between trigger to completion suggestion is displayed: ${performance.now() - t0}ms`
            return itemsMatchingTypeahead as InlineCompletionItem[]
        } catch (e) {
            getLogger('amazonqLsp').error('Failed to provide completion items: %O', e)
            logstr += `- failed to provide completion items ${(e as Error).message}`
            return []
        } finally {
            vsCodeState.isRecommendationsActive = false
            this.logger.info(logstr)
        }
    }
}
