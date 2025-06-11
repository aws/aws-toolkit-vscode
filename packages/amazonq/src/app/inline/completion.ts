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
    ReferenceInlineProvider,
} from 'aws-core-vscode/codewhisperer'
import { InlineGeneratingMessage } from './inlineGeneratingMessage'
import { LineTracker } from './stateTracker/lineTracker'
import { InlineTutorialAnnotation } from './tutorials/inlineTutorialAnnotation'
import { TelemetryHelper } from './telemetryHelper'
import { Experiments, getLogger } from 'aws-core-vscode/shared'
import { debounce, messageUtils } from 'aws-core-vscode/utils'
import { showEdits } from './EditRendering/imageRenderer'
import { NextEditPredictionPanel } from './webViewPanel'
import { ICursorUpdateRecorder } from './cursorUpdateManager'

export class InlineCompletionManager implements Disposable {
    private disposable: Disposable
    private inlineCompletionProvider: AmazonQInlineCompletionItemProvider
    private languageClient: LanguageClient
    private sessionManager: SessionManager
    private recommendationService: RecommendationService
    private lineTracker: LineTracker
    private incomingGeneratingMessage: InlineGeneratingMessage
    private inlineTutorialAnnotation: InlineTutorialAnnotation
    private readonly logSessionResultMessageName = 'aws/logInlineCompletionSessionResults'

    constructor(
        languageClient: LanguageClient,
        sessionManager: SessionManager,
        lineTracker: LineTracker,
        inlineTutorialAnnotation: InlineTutorialAnnotation,
        cursorUpdateRecorder?: ICursorUpdateRecorder
    ) {
        NextEditPredictionPanel.getInstance()
        this.languageClient = languageClient
        this.sessionManager = sessionManager
        this.lineTracker = lineTracker
        this.incomingGeneratingMessage = new InlineGeneratingMessage(this.lineTracker)
        this.recommendationService = new RecommendationService(
            this.sessionManager,
            this.incomingGeneratingMessage,
            cursorUpdateRecorder
        )
        this.inlineTutorialAnnotation = inlineTutorialAnnotation
        this.inlineCompletionProvider = new AmazonQInlineCompletionItemProvider(
            languageClient,
            this.recommendationService,
            this.sessionManager,
            this.inlineTutorialAnnotation
        )
        this.disposable = languages.registerInlineCompletionItemProvider(
            CodeWhispererConstants.platformLanguageIds,
            this.inlineCompletionProvider
        )

        this.lineTracker.ready()
    }

    public dispose(): void {
        if (this.disposable) {
            this.disposable.dispose()
            this.incomingGeneratingMessage.dispose()
            this.lineTracker.dispose()
        }
    }

    public getInlineCompletionProvider(): AmazonQInlineCompletionItemProvider {
        return this.inlineCompletionProvider
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
        let logstr = `GenerateCompletion metadata:\n`
        try {
            const t0 = performance.now()
            vsCodeState.isRecommendationsActive = true
            const isAutoTrigger = context.triggerKind === InlineCompletionTriggerKind.Automatic
            if (isAutoTrigger && !CodeSuggestionsState.instance.isSuggestionsEnabled()) {
                // return early when suggestions are disabled with auto trigger
                this.logger.debug('')
                return []
            }

            // TODO: comment this out for now as it's slow, will take ~200ms each trigger, need to investigate more
            // tell the tutorial that completions has been triggered
            // await this.inlineTutorialAnnotation.triggered(context.triggerKind)
            // TODO: remove this line as otherwise it wont compile
            this.inlineTutorialAnnotation

            TelemetryHelper.instance.setInvokeSuggestionStartTime()
            TelemetryHelper.instance.setTriggerType(context.triggerKind)

            const t1 = performance.now()

            await this.recommendationService.getAllRecommendations(
                this.languageClient,
                document,
                position,
                context,
                token,
                getAllRecommendationsOptions
            )
            // get active item from session for displaying
            const items = this.sessionManager.getActiveRecommendation()

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
            const editor = window.activeTextEditor

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
            for (const item of items) {
                if (item.isInlineEdit) {
                    // Check if Next Edit Prediction feature flag is enabled
                    if (Experiments.instance.isExperimentEnabled('amazonqLSPNEP')) {
                        const panel = NextEditPredictionPanel.getInstance()
                        panel.updateContent(item.insertText as string)
                        void showEdits(item, editor, session, this.languageClient).then(() => {
                            const t3 = performance.now()
                            logstr = logstr + `- duration since trigger to NEP suggestion is displayed: ${t3 - t0}ms`
                            this.logger.info(logstr)
                        })
                        getLogger('nextEditPrediction').info('Received edit!')
                    }
                }

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
                item.insertText = typeof item.insertText === 'string' ? item.insertText : item.insertText.value
                ImportAdderProvider.instance.onShowRecommendation(document, cursorPosition.line, item)
            }
            return items as InlineCompletionItem[]
        } catch (e) {
            getLogger('amazonqLsp').error('Failed to provide completion items: %O', e)
            return []
        } finally {
            vsCodeState.isRecommendationsActive = false
        }
    }
}
