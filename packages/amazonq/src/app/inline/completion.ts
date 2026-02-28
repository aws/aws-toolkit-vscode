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
import { BaseLanguageClient } from 'vscode-languageclient'
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
    noInlineSuggestionsMsg,
    getDiagnosticsDifferences,
    getDiagnosticsOfCurrentFile,
    toIdeDiagnostics,
    handleExtraBrackets,
    InlineCompletionLoggingReason,
} from 'aws-core-vscode/codewhisperer'
import { LineTracker } from './stateTracker/lineTracker'
import { InlineTutorialAnnotation } from './tutorials/inlineTutorialAnnotation'
import { TelemetryHelper } from './telemetryHelper'
import { Experiments, getContext, getLogger, sleep } from 'aws-core-vscode/shared'
import { messageUtils } from 'aws-core-vscode/utils'
import { EditsSuggestionSvg } from './EditRendering/imageRenderer'
import { ICursorUpdateRecorder } from './cursorUpdateManager'
import { DocumentEventListener } from './documentEventListener'

export class InlineCompletionManager implements Disposable {
    private disposable: Disposable
    private inlineCompletionProvider: AmazonQInlineCompletionItemProvider
    private languageClient: BaseLanguageClient
    private sessionManager: SessionManager
    private recommendationService: RecommendationService
    private lineTracker: LineTracker

    private inlineTutorialAnnotation: InlineTutorialAnnotation
    private readonly logSessionResultMessageName = 'aws/logInlineCompletionSessionResults'
    private documentEventListener: DocumentEventListener

    constructor(
        languageClient: BaseLanguageClient,
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
            position: vscode.Position,
            firstCompletionDisplayLatency?: number
        ) => {
            try {
                vsCodeState.isCodeWhispererEditing = true
                const startLine = position.line
                // TODO: also log the seen state for other suggestions in session
                // Calculate timing metrics before diagnostic delay
                const totalSessionDisplayTime = Date.now() - requestStartTime
                await sleep(500)
                const diagnosticDiff = getDiagnosticsDifferences(
                    this.sessionManager.getActiveSession()?.diagnosticsBeforeAccept,
                    getDiagnosticsOfCurrentFile()
                )
                // try remove the extra } ) ' " if there is a new reported problem
                // the extra } will cause syntax error
                if (diagnosticDiff.added.length > 0) {
                    await handleExtraBrackets(editor, editor.selection.active, position)
                }
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
                void this.languageClient.sendNotification(this.logSessionResultMessageName, params)
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
                const session = this.sessionManager.getActiveSession()
                if (session === undefined) {
                    return
                }
                const requestStartTime = session.requestStartTime
                const totalSessionDisplayTime = Date.now() - requestStartTime
                await commands.executeCommand('editor.action.inlineSuggest.hide')
                // TODO: also log the seen state for other suggestions in session
                this.disposable.dispose()
                this.disposable = languages.registerInlineCompletionItemProvider(
                    CodeWhispererConstants.platformLanguageIds,
                    this.inlineCompletionProvider
                )
                const sessionId = session.sessionId
                const itemId = this.sessionManager.getActiveRecommendation()[0]?.itemId
                if (!itemId) {
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
                    firstCompletionDisplayLatency: session.firstCompletionDisplayLatency,
                    totalSessionDisplayTime: totalSessionDisplayTime,
                }
                void this.languageClient.sendNotification(this.logSessionResultMessageName, params)
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
    private pendingRequest: Promise<InlineCompletionItem[]> | undefined
    private lastEdit: EditsSuggestionSvg | undefined

    constructor(
        private readonly languageClient: BaseLanguageClient,
        private readonly recommendationService: RecommendationService,
        private readonly sessionManager: SessionManager,
        private readonly inlineTutorialAnnotation: InlineTutorialAnnotation,
        private readonly documentEventListener: DocumentEventListener
    ) {}

    private readonly logSessionResultMessageName = 'aws/logInlineCompletionSessionResults'

    // Ideally use this API handleDidShowCompletionItem
    // https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.inlineCompletionsAdditions.d.ts#L83
    // we need this because the returned items of provideInlineCompletionItems may not be actually rendered on screen
    // if VS Code believes the user is actively typing then it will not show such item
    async checkWhetherInlineCompletionWasShown() {
        // this line is to force VS Code to re-render the inline completion
        // if it decides the inline completion can be shown
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
        // yield event loop to let backend state transition finish plus wait for vsc to render
        await sleep(10)
        // run the command to detect if inline suggestion is really shown or not
        await vscode.commands.executeCommand(`aws.amazonq.checkInlineSuggestionVisibility`)
    }

    /**
     * Check if a completion suggestion is currently active/displayed
     */
    public async isCompletionActive(): Promise<boolean> {
        const session = this.sessionManager.getActiveSession()
        if (session === undefined || !session.displayed || session.suggestions.some((item) => item.isInlineEdit)) {
            return false
        }

        // Use VS Code command to check if inline suggestion is actually visible on screen
        // This command only executes when inlineSuggestionVisible context is true
        await vscode.commands.executeCommand('aws.amazonq.checkInlineSuggestionVisibility')
        const isInlineSuggestionVisible = Date.now() - session.lastVisibleTime < 50
        return isInlineSuggestionVisible
    }

    /**
     * Batch discard telemetry for completion suggestions when edit suggestion is active
     */
    public batchDiscardTelemetryForEditSuggestion(items: any[], session: any): void {
        // Emit DISCARD telemetry for completion suggestions that can't be shown due to active edit
        const completionSessionResult: {
            [key: string]: { seen: boolean; accepted: boolean; discarded: boolean }
        } = {}

        for (const item of items) {
            if (!item.isInlineEdit && item.itemId) {
                completionSessionResult[item.itemId] = {
                    seen: false,
                    accepted: false,
                    discarded: true,
                }
            }
        }

        // Send single telemetry event for all discarded items
        if (Object.keys(completionSessionResult).length > 0) {
            const params: LogInlineCompletionSessionResultsParams = {
                sessionId: session.sessionId,
                completionSessionResult,
                firstCompletionDisplayLatency: session.firstCompletionDisplayLatency,
                totalSessionDisplayTime: Date.now() - session.requestStartTime,
            }
            void this.languageClient.sendNotification(this.logSessionResultMessageName, params)
        }
    }

    // This method is automatically invoked by VS Code as user types
    async provideInlineCompletionItems(
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

        // If there's already a pending request, wait for it to complete instead of starting a new one
        // This prevents race conditions where multiple concurrent calls cause the later (empty) response
        // to override the earlier (valid) response
        if (this.pendingRequest) {
            getLogger().info('Reusing pending inline completion request to avoid race condition')
            try {
                const result = await this.pendingRequest
                // Check if THIS call's token was cancelled (not the original call's token)
                if (token.isCancellationRequested) {
                    getLogger().info('Reused request completed but this call was cancelled')
                    return []
                }
                return result
            } catch (e) {
                // If the pending request failed, continue with a new request
                getLogger().info('Pending request failed, starting new request: %O', e)
            }
        }

        // Start a new request and track it
        this.pendingRequest = this._provideInlineCompletionItemsImpl(
            document,
            position,
            context,
            token,
            getAllRecommendationsOptions
        )

        try {
            return await this.pendingRequest
        } finally {
            this.pendingRequest = undefined
        }
    }

    private async _provideInlineCompletionItemsImpl(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken,
        getAllRecommendationsOptions?: GetAllRecommendationsOptions
    ): Promise<InlineCompletionItem[]> {
        if (vsCodeState.isCodeWhispererEditing) {
            getLogger().info('Q is editing, returning empty')
            return []
        }

        // Make edit suggestion blocking
        if (getContext('aws.amazonq.editSuggestionActive') === true) {
            return []
        }

        // there is a bug in VS Code, when hitting Enter, the context.triggerKind is Invoke (0)
        // when hitting other keystrokes, the context.triggerKind is Automatic (1)
        // we only mark option + C as manual trigger
        // this is a workaround since the inlineSuggest.trigger command take no params
        const isAutoTrigger = Date.now() - vsCodeState.lastManualTriggerTime > 50
        if (isAutoTrigger && !CodeSuggestionsState.instance.isSuggestionsEnabled()) {
            // return early when suggestions are disabled with auto trigger
            return []
        }

        // yield event loop to let the document listen catch updates
        await sleep(1)

        let logstr = `GenerateCompletion activity:\n`
        try {
            const t0 = Date.now()
            vsCodeState.isRecommendationsActive = true
            // handling previous session
            const prevSession = this.sessionManager.getActiveSession()
            const prevSessionId = prevSession?.sessionId
            const prevItemId = this.sessionManager.getActiveRecommendation()?.[0]?.itemId
            const prevStartPosition = prevSession?.startPosition
            const editsTriggerOnAcceptance = prevSession?.triggerOnAcceptance
            if (editsTriggerOnAcceptance) {
                getAllRecommendationsOptions = {
                    ...getAllRecommendationsOptions,
                    editsStreakToken: prevSession?.editsStreakPartialResultToken,
                }
            }
            const editor = window.activeTextEditor
            // Skip prefix matching for Edits suggestions that trigger on acceptance.
            if (prevSession && prevSessionId && prevItemId && prevStartPosition && !editsTriggerOnAcceptance) {
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
                                position,
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
                    - duration between trigger to completion suggestion is displayed ${Date.now() - t0}`
                    void this.checkWhetherInlineCompletionWasShown()
                    return prevItemMatchingPrefix
                }

                // if no such suggestions, report the previous suggestion as Reject or Discarded
                const params: LogInlineCompletionSessionResultsParams = {
                    sessionId: prevSessionId,
                    completionSessionResult: {
                        [prevItemId]: {
                            seen: prevSession.displayed,
                            accepted: false,
                            discarded: !prevSession.displayed,
                        },
                    },
                    reason: InlineCompletionLoggingReason.IMPLICIT_REJECT,
                    firstCompletionDisplayLatency: prevSession.firstCompletionDisplayLatency,
                    totalSessionDisplayTime: Date.now() - prevSession.requestStartTime,
                }
                void this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                this.sessionManager.clear()
                // Do not make auto trigger if user rejects a suggestion
                // by typing characters that does not match
                return []
            }

            // tell the tutorial that completions has been triggered
            await this.inlineTutorialAnnotation.triggered(context.triggerKind)

            TelemetryHelper.instance.setInvokeSuggestionStartTime()
            TelemetryHelper.instance.setTriggerType(context.triggerKind)

            const t1 = Date.now()

            await this.recommendationService.getAllRecommendations(
                this.languageClient,
                document,
                position,
                {
                    triggerKind: isAutoTrigger ? 1 : 0,
                    selectedCompletionInfo: context.selectedCompletionInfo,
                },
                token,
                isAutoTrigger,
                this.documentEventListener,
                getAllRecommendationsOptions
            )
            // get active item from session for displaying
            const items = this.sessionManager.getActiveRecommendation()
            const itemId = this.sessionManager.getActiveRecommendation()?.[0]?.itemId

            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            const itemLog = items[0] ? `${items[0].insertText.toString()}` : `no suggestion`

            const t2 = Date.now()

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

            // Completion will not be rendered if users cursor moves to a position which is before the position when the service is invoked
            if (items.length > 0 && !items[0].isInlineEdit) {
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
                    void this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                    this.sessionManager.clear()
                    logstr += `- cursor moved behind trigger position. Discarding completion suggestion...`
                    return []
                }
            }

            // delay the suggestion rendeing if user is actively typing
            // see https://github.com/aws/aws-toolkit-vscode/commit/a537602a96f498f372ed61ec9d82cf8577a9d854
            for (let i = 0; i < 30; i++) {
                const lastDocumentChange = this.documentEventListener.getLastDocumentChangeEvent(document.uri.fsPath)
                if (
                    lastDocumentChange &&
                    Date.now() - lastDocumentChange.timestamp < CodeWhispererConstants.inlineSuggestionShowDelay
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
                        if (this.lastEdit) {
                            await this.lastEdit.dispose()
                        }
                        const e = new EditsSuggestionSvg(item, editor, this.languageClient, session, this)
                        await e.show()
                        this.lastEdit = e
                        logstr += `- duration between trigger to edits suggestion is displayed: ${Date.now() - t0}ms`
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
                            cursorPosition,
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
                void this.languageClient.sendNotification(this.logSessionResultMessageName, params)
                this.sessionManager.clear()
                logstr += `- suggestion does not match user typeahead from insertion position. Discarding suggestion...`
                return []
            }

            this.sessionManager.updateCodeReferenceAndImports()
            // suggestions returned here will be displayed on screen
            logstr += `- duration between trigger to completion suggestion is displayed: ${Date.now() - t0}ms`
            void this.checkWhetherInlineCompletionWasShown()
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
