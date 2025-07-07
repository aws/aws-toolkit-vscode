/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
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
    ReferenceInlineProvider,
} from 'aws-core-vscode/codewhisperer'
import { LineTracker } from './stateTracker/lineTracker'
import { InlineTutorialAnnotation } from './tutorials/inlineTutorialAnnotation'
import { TelemetryHelper } from './telemetryHelper'
import { Experiments, getLogger, sleep } from 'aws-core-vscode/shared'
import { debounce, messageUtils } from 'aws-core-vscode/utils'
import { showEdits } from './EditRendering/imageRenderer'
import { ICursorUpdateRecorder } from './cursorUpdateManager'

let lastDocumentDeleteEvent: vscode.TextDocumentChangeEvent | undefined = undefined
let lastDocumentDeleteTime = 0

export class InlineCompletionManager implements Disposable {
    private disposable: Disposable
    private inlineCompletionProvider: AmazonQInlineCompletionItemProvider
    private languageClient: LanguageClient
    private sessionManager: SessionManager
    private recommendationService: RecommendationService
    private lineTracker: LineTracker

    private inlineTutorialAnnotation: InlineTutorialAnnotation
    private readonly logSessionResultMessageName = 'aws/logInlineCompletionSessionResults'
    private documentChangeListener: Disposable

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
        this.inlineCompletionProvider = new AmazonQInlineCompletionItemProvider(
            languageClient,
            this.recommendationService,
            this.sessionManager,
            this.inlineTutorialAnnotation
        )

        this.documentChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.contentChanges.length === 1 && e.contentChanges[0].text === '') {
                lastDocumentDeleteEvent = e
                lastDocumentDeleteTime = performance.now()
            }
        })
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
        if (this.documentChangeListener) {
            this.documentChangeListener.dispose()
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
            // TODO: also log the seen state for other suggestions in session
            const params: LogInlineCompletionSessionResultsParams = {
                sessionId: sessionId,
                completionSessionResult: {
                    [item.itemId]: {
                        seen: true,
                        accepted: true,
                        discarded: false,
                    },
                },
                totalSessionDisplayTime: Date.now() - requestStartTime,
                firstCompletionDisplayLatency: firstCompletionDisplayLatency,
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

                // Show codelense for 5 seconds.
                ReferenceInlineProvider.instance.setInlineReference(
                    startLine,
                    item.insertText as string,
                    item.references
                )
                setTimeout(() => {
                    ReferenceInlineProvider.instance.removeInlineReference()
                }, 5000)
            }
            if (item.mostRelevantMissingImports?.length) {
                await ImportAdderProvider.instance.onAcceptRecommendation(editor, item, startLine)
            }
            this.sessionManager.incrementSuggestionCount()
            // clear session manager states once accepted
            this.sessionManager.clear()
        }
        commands.registerCommand('aws.amazonq.acceptInline', onInlineAcceptance)

        const onInlineRejection = async () => {
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
            }
            this.languageClient.sendNotification(this.logSessionResultMessageName, params)
            // clear session manager states once rejected
            this.sessionManager.clear()
        }
        commands.registerCommand('aws.amazonq.rejectCodeSuggestion', onInlineRejection)
    }
}

export class AmazonQInlineCompletionItemProvider implements InlineCompletionItemProvider {
    private logger = getLogger('nextEditPrediction')
    constructor(
        private readonly languageClient: LanguageClient,
        private readonly recommendationService: RecommendationService,
        private readonly sessionManager: SessionManager,
        private readonly inlineTutorialAnnotation: InlineTutorialAnnotation
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
        })

        // prevent concurrent API calls and write to shared state variables
        if (vsCodeState.isRecommendationsActive) {
            getLogger().info('Recommendations already active, returning empty')
            return []
        }
        // yield event loop to let the document listen catch updates
        await sleep(1)
        // prevent user deletion invoking auto trigger
        // this is a best effort estimate of deletion
        const timeDiff = Math.abs(performance.now() - lastDocumentDeleteTime)
        if (timeDiff < 500 && lastDocumentDeleteEvent && lastDocumentDeleteEvent.document.uri === document.uri) {
            getLogger().debug('Skip auto trigger when deleting code')
            return []
        }

        let logstr = `GenerateCompletion metadata:\\n`
        try {
            const t0 = performance.now()
            vsCodeState.isRecommendationsActive = true
            const isAutoTrigger = context.triggerKind === InlineCompletionTriggerKind.Automatic
            if (isAutoTrigger && !CodeSuggestionsState.instance.isSuggestionsEnabled()) {
                // return early when suggestions are disabled with auto trigger
                return []
            }

            // handling previous session
            const prevSession = this.sessionManager.getActiveSession()
            const prevSessionId = prevSession?.sessionId
            const prevItemId = this.sessionManager.getActiveRecommendation()?.[0]?.itemId
            const prevStartPosition = prevSession?.startPosition
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
                    getLogger().debug(`Re-using suggestions that match user typed characters`)
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
                }
                this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                this.sessionManager.clear()
            }

            // TODO: this line will take ~200ms each trigger, need to root cause and maybe better to disable it for now
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
                getAllRecommendationsOptions
            )
            // get active item from session for displaying
            const items = this.sessionManager.getActiveRecommendation()
            const itemId = this.sessionManager.getActiveRecommendation()?.[0]?.itemId

            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const itemLog = items[0] ? `${items[0].insertText.toString()}` : `no suggestion`

            const t2 = performance.now()

            logstr = logstr += `- number of suggestions: ${items.length}
- first suggestion content (next line):
${itemLog}
- duration since trigger to before sending Flare call: ${t1 - t0}ms
- duration since trigger to receiving responses from Flare: ${t2 - t0}ms
`
            const session = this.sessionManager.getActiveSession()

            // Show message to user when manual invoke fails to produce results.
            if (items.length === 0 && context.triggerKind === InlineCompletionTriggerKind.Invoke) {
                void messageUtils.showTimedMessage(noInlineSuggestionsMsg, 2000)
            }

            if (!session || !items.length || !editor) {
                getLogger().debug(
                    `Failed to produce inline suggestion results. Received ${items.length} items from service`
                )
                return []
            }

            const cursorPosition = document.validatePosition(position)

            if (position.isAfter(editor.selection.active)) {
                getLogger().debug(`Cursor moved behind trigger position. Discarding suggestion...`)
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
                return []
            }

            // the user typed characters from invoking suggestion cursor position to receiving suggestion position
            const typeahead = document.getText(new Range(position, editor.selection.active))

            const itemsMatchingTypeahead = []

            for (const item of items) {
                if (item.isInlineEdit) {
                    // Check if Next Edit Prediction feature flag is enabled
                    if (Experiments.instance.isExperimentEnabled('amazonqLSPNEP')) {
                        void showEdits(item, editor, session, this.languageClient, this).then(() => {
                            const t3 = performance.now()
                            logstr = logstr + `- duration since trigger to NEP suggestion is displayed: ${t3 - t0}ms`
                            this.logger.info(logstr)
                        })
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
                    ImportAdderProvider.instance.onShowRecommendation(document, cursorPosition.line, item)
                }
            }

            // report discard if none of suggestions match typeahead
            if (itemsMatchingTypeahead.length === 0) {
                getLogger().debug(
                    `Suggestion does not match user typeahead from insertion position. Discarding suggestion...`
                )
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
                return []
            }

            // suggestions returned here will be displayed on screen
            return itemsMatchingTypeahead as InlineCompletionItem[]
        } catch (e) {
            getLogger('amazonqLsp').error('Failed to provide completion items: %O', e)
            return []
        } finally {
            vsCodeState.isRecommendationsActive = false
        }
    }
}
