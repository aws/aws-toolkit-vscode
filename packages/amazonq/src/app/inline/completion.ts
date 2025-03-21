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
} from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import {
    InlineCompletionListWithReferences,
    InlineCompletionWithReferencesParams,
    inlineCompletionWithReferencesRequestType,
    logInlineCompletionSessionResultsNotificationType,
    LogInlineCompletionSessionResultsParams,
} from '@aws/language-server-runtimes/protocol'
import { CodeWhispererConstants } from 'aws-core-vscode/codewhisperer'

export function registerInlineCompletion(languageClient: LanguageClient) {
    const inlineCompletionProvider = new AmazonQInlineCompletionItemProvider(languageClient)
    languages.registerInlineCompletionItemProvider(CodeWhispererConstants.platformLanguageIds, inlineCompletionProvider)

    const onInlineAcceptance = async (
        sessionId: string,
        itemId: string,
        requestStartTime: number,
        firstCompletionDisplayLatency?: number
    ) => {
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
        languageClient.sendNotification(logInlineCompletionSessionResultsNotificationType as any, params)
    }
    commands.registerCommand('aws.sample-vscode-ext-amazonq.accept', onInlineAcceptance)
}

export class AmazonQInlineCompletionItemProvider implements InlineCompletionItemProvider {
    constructor(private readonly languageClient: LanguageClient) {}

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | InlineCompletionList> {
        const requestStartTime = Date.now()
        const request: InlineCompletionWithReferencesParams = {
            textDocument: {
                uri: document.uri.toString(),
            },
            position,
            context,
        }

        const response = await this.languageClient.sendRequest(
            inlineCompletionWithReferencesRequestType as any,
            request,
            token
        )

        const list: InlineCompletionListWithReferences = response as InlineCompletionListWithReferences
        this.languageClient.info(`Client: Received ${list.items.length} suggestions`)
        const firstCompletionDisplayLatency = Date.now() - requestStartTime

        // Add completion session tracking and attach onAcceptance command to each item to record used decision
        for (const item of list.items) {
            item.command = {
                command: 'aws.sample-vscode-ext-amazonq.accept',
                title: 'On acceptance',
                arguments: [list.sessionId, item.itemId, requestStartTime, firstCompletionDisplayLatency],
            }
        }

        return list as InlineCompletionList
    }
}
