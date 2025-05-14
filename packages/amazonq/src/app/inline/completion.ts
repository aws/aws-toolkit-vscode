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
import { RecommendationService } from './recommendationService'
import {
    CodeWhispererConstants,
    ReferenceHoverProvider,
    ReferenceInlineProvider,
    ReferenceLogViewProvider,
    ImportAdderProvider,
    CodeSuggestionsState,
    vsCodeState,
    inlineCompletionsDebounceDelay,
} from 'aws-core-vscode/codewhisperer'
import { InlineGeneratingMessage } from './inlineGeneratingMessage'
import { LineTracker } from './stateTracker/lineTracker'
import { InlineTutorialAnnotation } from './tutorials/inlineTutorialAnnotation'
import { TelemetryHelper } from './telemetryHelper'
import { getLogger } from 'aws-core-vscode/shared'
import { debounce } from 'aws-core-vscode/utils'

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
        inlineTutorialAnnotation: InlineTutorialAnnotation
    ) {
        this.languageClient = languageClient
        this.sessionManager = sessionManager
        this.lineTracker = lineTracker
        this.incomingGeneratingMessage = new InlineGeneratingMessage(this.lineTracker)
        this.recommendationService = new RecommendationService(this.sessionManager, this.incomingGeneratingMessage)
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

        /*
            We have to overwrite the prev. and next. commands because the inlineCompletionProvider only contained the current item
            To show prev. and next. recommendation we need to re-register a new provider with the previous or next item
        */

        const swapProviderAndShow = async () => {
            await commands.executeCommand('editor.action.inlineSuggest.hide')
            this.disposable.dispose()
            this.disposable = languages.registerInlineCompletionItemProvider(
                CodeWhispererConstants.platformLanguageIds,
                new AmazonQInlineCompletionItemProvider(
                    this.languageClient,
                    this.recommendationService,
                    this.sessionManager,
                    this.inlineTutorialAnnotation,
                    false
                )
            )
            await commands.executeCommand('editor.action.inlineSuggest.trigger')
        }

        const prevCommandHandler = async () => {
            this.sessionManager.decrementActiveIndex()
            await swapProviderAndShow()
        }
        commands.registerCommand('editor.action.inlineSuggest.showPrevious', prevCommandHandler)

        const nextCommandHandler = async () => {
            this.sessionManager.incrementActiveIndex()
            await swapProviderAndShow()
        }
        commands.registerCommand('editor.action.inlineSuggest.showNext', nextCommandHandler)
    }
}

export class AmazonQInlineCompletionItemProvider implements InlineCompletionItemProvider {
    constructor(
        private readonly languageClient: LanguageClient,
        private readonly recommendationService: RecommendationService,
        private readonly sessionManager: SessionManager,
        private readonly inlineTutorialAnnotation: InlineTutorialAnnotation,
        private readonly isNewSession: boolean = true
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
        token: CancellationToken
    ): Promise<InlineCompletionItem[]> {
        try {
            vsCodeState.isRecommendationsActive = true
            if (this.isNewSession) {
                const isAutoTrigger = context.triggerKind === InlineCompletionTriggerKind.Automatic
                if (isAutoTrigger && !CodeSuggestionsState.instance.isSuggestionsEnabled()) {
                    // return early when suggestions are disabled with auto trigger
                    return []
                }

                // tell the tutorial that completions has been triggered
                await this.inlineTutorialAnnotation.triggered(context.triggerKind)
                TelemetryHelper.instance.setInvokeSuggestionStartTime()
                TelemetryHelper.instance.setTriggerType(context.triggerKind)

                // make service requests if it's a new session
                await this.recommendationService.getAllRecommendations(
                    this.languageClient,
                    document,
                    position,
                    context,
                    token
                )
            }
            // get active item from session for displaying
            const items = this.sessionManager.getActiveRecommendation()
            const session = this.sessionManager.getActiveSession()
            const editor = window.activeTextEditor
            if (!session || !items.length || !editor) {
                return []
            }

            const cursorPosition = document.validatePosition(position)
            for (const item of items) {
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
                ReferenceInlineProvider.instance.setInlineReference(
                    cursorPosition.line,
                    item.insertText,
                    item.references
                )
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
