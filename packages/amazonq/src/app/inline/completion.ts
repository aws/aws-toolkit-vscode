/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CancellationToken,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionItemProvider,
    InlineCompletionList,
    Position,
    TextDocument,
    commands,
    languages,
    Disposable,
} from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import {
    logInlineCompletionSessionResultsNotificationType,
    LogInlineCompletionSessionResultsParams,
} from '@aws/language-server-runtimes/protocol'
import { Commands } from 'aws-core-vscode/shared'
import { SessionManager } from './sessionManager'
import { RecommendationService } from './recommendationService'
import { CodeWhispererConstants } from 'aws-core-vscode/codewhisperer'

export class InlineCompletionManager implements Disposable {
    private disposable: Disposable
    private inlineCompletionProvider: AmazonQInlineCompletionItemProvider
    private languageClient: LanguageClient

    constructor(languageClient: LanguageClient) {
        this.languageClient = languageClient
        this.inlineCompletionProvider = new AmazonQInlineCompletionItemProvider(languageClient)
        this.disposable = languages.registerInlineCompletionItemProvider(
            CodeWhispererConstants.platformLanguageIds,
            this.inlineCompletionProvider
        )
    }

    public dispose(): void {
        if (this.disposable) {
            this.disposable.dispose()
        }
    }

    public registerInlineCompletion() {
        const onInlineAcceptance = async (
            sessionId: string,
            itemId: string,
            requestStartTime: number,
            firstCompletionDisplayLatency?: number
        ) => {
            // TODO: also log the seen state for other suggestions in session
            const params: LogInlineCompletionSessionResultsParams = {
                sessionId: sessionId,
                completionSessionResult: {
                    [itemId]: {
                        seen: true,
                        accepted: true,
                        discarded: false,
                    },
                },
                totalSessionDisplayTime: Date.now() - requestStartTime,
                firstCompletionDisplayLatency: firstCompletionDisplayLatency,
            }
            this.languageClient.sendNotification(logInlineCompletionSessionResultsNotificationType as any, params)
            this.disposable.dispose()
            this.disposable = languages.registerInlineCompletionItemProvider(
                CodeWhispererConstants.platformLanguageIds,
                this.inlineCompletionProvider
            )
        }
        commands.registerCommand('aws.sample-vscode-ext-amazonq.accept', onInlineAcceptance)

        const oninlineRejection = async (sessionId: string, itemId: string) => {
            await commands.executeCommand('editor.action.inlineSuggest.hide')
            // TODO: also log the seen state for other suggestions in session
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
            this.languageClient.sendNotification(logInlineCompletionSessionResultsNotificationType as any, params)
            this.disposable.dispose()
            this.disposable = languages.registerInlineCompletionItemProvider(
                CodeWhispererConstants.platformLanguageIds,
                this.inlineCompletionProvider
            )
        }
        commands.registerCommand('aws.sample-vscode-ext-amazonq.reject', oninlineRejection)

        /*
            We have to overwrite the prev. and next. commands because the inlineCompletionProvider only contained the current item
            To show prev. and next. recommendation we need to re-register a new provider with the previous or next item
        */

        const prevCommand = Commands.declare('editor.action.inlineSuggest.showPrevious', () => async () => {
            SessionManager.instance.decrementActiveIndex()
            this.disposable.dispose()
            this.disposable = languages.registerInlineCompletionItemProvider(
                CodeWhispererConstants.platformLanguageIds,
                new AmazonQInlineCompletionItemProvider(this.languageClient, false)
            )
            await commands.executeCommand('editor.action.inlineSuggest.hide')
            await commands.executeCommand('editor.action.inlineSuggest.trigger')
        })
        prevCommand.register()

        const nextCommand = Commands.declare('editor.action.inlineSuggest.showNext', () => async () => {
            SessionManager.instance.incrementActiveIndex()
            this.disposable.dispose()
            this.disposable = languages.registerInlineCompletionItemProvider(
                CodeWhispererConstants.platformLanguageIds,
                new AmazonQInlineCompletionItemProvider(this.languageClient, false)
            )
            await commands.executeCommand('editor.action.inlineSuggest.hide')
            await commands.executeCommand('editor.action.inlineSuggest.trigger')
        })
        nextCommand.register()
    }
}

export class AmazonQInlineCompletionItemProvider implements InlineCompletionItemProvider {
    constructor(
        private readonly languageClient: LanguageClient,
        private readonly isNewSesion: boolean = true
    ) {}

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | InlineCompletionList> {
        if (this.isNewSesion) {
            // make service requests if it's a new session
            await RecommendationService.instance.getAllRecommendations(
                this.languageClient,
                document,
                position,
                context,
                token
            )
        }
        // get active item from session for displaying
        return SessionManager.instance.getActiveRecommendation()
    }
}
