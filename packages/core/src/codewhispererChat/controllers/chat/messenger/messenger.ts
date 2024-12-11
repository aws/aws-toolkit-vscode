/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitUntil } from '../../../../shared/utilities/timeoutUtils'
import {
    AppToWebViewMessageDispatcher,
    AuthNeededException,
    CodeReference,
    EditorContextCommandMessage,
    OpenSettingsMessage,
    QuickActionMessage,
} from '../../../view/connector/connector'
import { EditorContextCommandType } from '../../../commands/registerCommands'
import { ChatResponseStream as qdevChatResponseStream } from '@amzn/amazon-q-developer-streaming-client'
import {
    ChatResponseStream as cwChatResponseStream,
    CodeWhispererStreamingServiceException,
    SupplementaryWebLink,
} from '@amzn/codewhisperer-streaming'
import { ChatMessage, ErrorMessage, FollowUp, Suggestion } from '../../../view/connector/connector'
import { ChatSession } from '../../../clients/chat/v0/chat'
import { ChatException } from './model'
import { CWCTelemetryHelper } from '../telemetryHelper'
import { ChatPromptCommandType, TriggerPayload } from '../model'
import { getHttpStatusCode, getRequestId, ToolkitError } from '../../../../shared/errors'
import { keys } from '../../../../shared/utilities/tsUtils'
import { getLogger } from '../../../../shared/logger/logger'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import { CodeScanIssue } from '../../../../codewhisperer/models/model'
import { marked } from 'marked'
import { JSDOM } from 'jsdom'
import { LspController } from '../../../../amazonq/lsp/lspController'
import { extractCodeBlockLanguage } from '../../../../shared/markdown'
import { extractAuthFollowUp } from '../../../../amazonq/util/authUtils'
import { helpMessage } from '../../../../amazonq/webview/ui/texts/constants'

export type StaticTextResponseType = 'quick-action-help' | 'onboarding-help' | 'transform' | 'help'

export type MessengerResponseType = {
    $metadata: { requestId?: string; httpStatusCode?: number }
    message?: AsyncIterable<cwChatResponseStream | qdevChatResponseStream>
}

export class Messenger {
    public constructor(
        private readonly dispatcher: AppToWebViewMessageDispatcher,
        private readonly telemetryHelper: CWCTelemetryHelper
    ) {}

    public async sendAuthNeededExceptionMessage(credentialState: FeatureAuthState, tabID: string, triggerID: string) {
        const { message, authType } = extractAuthFollowUp(credentialState)
        this.dispatcher.sendAuthNeededExceptionMessage(
            new AuthNeededException(
                {
                    message,
                    authType,
                    triggerID,
                },
                tabID
            )
        )
    }

    public sendInitalStream(tabID: string, triggerID: string) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer-stream',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: '',
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                },
                tabID
            )
        )
    }
    /**
     * Tries to calculate the total number of code blocks.
     * NOTES:
     *  - Not correct on all examples. Some may cause it to return 0 unexpectedly.
     *  - Plans in place (as of 4/22/2024) to move this server side.
     *  - See original pr: https://github.com/aws/aws-toolkit-vscode/pull/4761 for more details.
     * @param message raw message response from codewhisperer client.
     * @returns count of multi-line code blocks in response.
     */
    public async countTotalNumberOfCodeBlocks(message: string): Promise<number> {
        // TODO: remove this when moved to server-side.
        if (message === undefined) {
            return 0
        }

        // To Convert Markdown text to HTML using marked library
        const html = await marked(message)

        const dom = new JSDOM(html)
        const document = dom.window.document

        // Search for <pre> elements containing <code> elements
        const codeBlocks = document.querySelectorAll('pre > code')

        return codeBlocks.length
    }

    public async sendAIResponse(
        response: MessengerResponseType,
        session: ChatSession,
        tabID: string,
        triggerID: string,
        triggerPayload: TriggerPayload
    ) {
        let message = ''
        const messageID = response.$metadata.requestId ?? ''
        let codeReference: CodeReference[] = []
        let followUps: FollowUp[] = []
        let relatedSuggestions: Suggestion[] = []
        let codeBlockLanguage: string = 'plaintext'

        if (response.message === undefined) {
            throw new ToolkitError(
                `Empty response from CodeWhisperer Streaming service. Request ID: ${response.$metadata.requestId}`
            )
        }
        this.telemetryHelper.setResponseStreamStartTime(tabID)
        if (
            triggerPayload.relevantTextDocuments &&
            triggerPayload.relevantTextDocuments.length > 0 &&
            triggerPayload.useRelevantDocuments === true
        ) {
            this.telemetryHelper.setResponseFromProjectContext(messageID)
        }

        const eventCounts = new Map<string, number>()
        waitUntil(
            async () => {
                for await (const chatEvent of response.message!) {
                    for (const key of keys(chatEvent)) {
                        if ((chatEvent[key] as any) !== undefined) {
                            eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
                        }
                    }

                    if (session.tokenSource.token.isCancellationRequested) {
                        return true
                    }

                    if (
                        chatEvent.codeReferenceEvent?.references !== undefined &&
                        chatEvent.codeReferenceEvent.references.length > 0
                    ) {
                        codeReference = [
                            ...codeReference,
                            ...chatEvent.codeReferenceEvent.references.map((reference) => ({
                                ...reference,
                                recommendationContentSpan: {
                                    start: reference.recommendationContentSpan?.start ?? 0,
                                    end: reference.recommendationContentSpan?.end ?? 0,
                                },
                                information: `Reference code under **${reference.licenseName}** license from repository \`${reference.repository}\``,
                            })),
                        ]
                    }

                    if (
                        chatEvent.assistantResponseEvent?.content !== undefined &&
                        chatEvent.assistantResponseEvent.content.length > 0
                    ) {
                        message += chatEvent.assistantResponseEvent.content
                        if (codeBlockLanguage === 'plaintext') {
                            codeBlockLanguage = extractCodeBlockLanguage(message)
                        }
                        this.dispatcher.sendChatMessage(
                            new ChatMessage(
                                {
                                    message: message,
                                    messageType: 'answer-part',
                                    followUps: undefined,
                                    followUpsHeader: undefined,
                                    relatedSuggestions: undefined,
                                    codeReference,
                                    triggerID,
                                    messageID,
                                    userIntent: triggerPayload.userIntent,
                                    codeBlockLanguage: codeBlockLanguage,
                                },
                                tabID
                            )
                        )
                        this.telemetryHelper.setResponseStreamTimeForChunks(tabID)
                    }

                    if (chatEvent.supplementaryWebLinksEvent?.supplementaryWebLinks !== undefined) {
                        let suggestionIndex = 0
                        const newSuggestions: Suggestion[] =
                            chatEvent.supplementaryWebLinksEvent.supplementaryWebLinks.map(
                                (s: SupplementaryWebLink) =>
                                    new Suggestion({
                                        title: s.title ?? '',
                                        url: s.url ?? '',
                                        body: s.snippet ?? '',
                                        id: suggestionIndex++,
                                        context: [],
                                    })
                            )
                        relatedSuggestions.push(...newSuggestions)
                    }

                    if (chatEvent.followupPromptEvent?.followupPrompt !== undefined) {
                        const followUp = chatEvent.followupPromptEvent.followupPrompt
                        followUps.push({
                            type: followUp.userIntent ?? '',
                            pillText: followUp.content ?? '',
                            prompt: followUp.content ?? '',
                        })
                    }
                }
                return true
            },
            { timeout: 60000, truthy: true }
        )
            .catch((error: any) => {
                let errorMessage = 'Error reading chat stream.'
                let statusCode = undefined
                let requestID = undefined

                if (error instanceof CodeWhispererStreamingServiceException) {
                    errorMessage = error.message
                    statusCode = getHttpStatusCode(error) ?? 0
                    requestID = getRequestId(error)
                }

                this.showChatExceptionMessage(
                    { errorMessage, statusCode: statusCode?.toString(), sessionID: undefined },
                    tabID,
                    requestID
                )
                getLogger().error(`error: ${errorMessage} tabID: ${tabID} requestID: ${requestID}`)

                followUps = []
                relatedSuggestions = []
                this.telemetryHelper.recordMessageResponseError(triggerPayload, tabID, statusCode ?? 0)
            })
            .finally(async () => {
                if (
                    triggerPayload.relevantTextDocuments &&
                    triggerPayload.relevantTextDocuments.length > 0 &&
                    LspController.instance.isIndexingInProgress()
                ) {
                    this.dispatcher.sendChatMessage(
                        new ChatMessage(
                            {
                                message:
                                    message +
                                    ` \n\nBy the way, I'm still indexing this project for full context from your workspace. I may have a better response in a few minutes when it's complete if you'd like to try again then.`,
                                messageType: 'answer-part',
                                followUps: undefined,
                                followUpsHeader: undefined,
                                relatedSuggestions: undefined,
                                triggerID,
                                messageID,
                                userIntent: triggerPayload.userIntent,
                                codeBlockLanguage: codeBlockLanguage,
                            },
                            tabID
                        )
                    )
                }

                if (relatedSuggestions.length !== 0) {
                    this.dispatcher.sendChatMessage(
                        new ChatMessage(
                            {
                                message: undefined,
                                messageType: 'answer-part',
                                followUpsHeader: undefined,
                                followUps: undefined,
                                relatedSuggestions,
                                triggerID,
                                messageID,
                                userIntent: triggerPayload.userIntent,
                                codeBlockLanguage: undefined,
                            },
                            tabID
                        )
                    )
                }

                this.dispatcher.sendChatMessage(
                    new ChatMessage(
                        {
                            message: undefined,
                            messageType: 'answer',
                            followUps: followUps,
                            followUpsHeader: undefined,
                            relatedSuggestions: undefined,
                            triggerID,
                            messageID,
                            userIntent: triggerPayload.userIntent,
                            codeBlockLanguage: undefined,
                        },
                        tabID
                    )
                )

                getLogger().info(
                    `All events received. requestId=%s counts=%s`,
                    response.$metadata.requestId,
                    Object.fromEntries(eventCounts)
                )

                this.telemetryHelper.setResponseStreamTotalTime(tabID)

                const responseCode = response?.$metadata.httpStatusCode ?? 0
                this.telemetryHelper.recordAddMessage(triggerPayload, {
                    followUpCount: followUps.length,
                    suggestionCount: relatedSuggestions.length,
                    tabID: tabID,
                    messageLength: message.length,
                    messageID,
                    responseCode,
                    codeReferenceCount: codeReference.length,
                    totalNumberOfCodeBlocksInResponse: await this.countTotalNumberOfCodeBlocks(message),
                })
            })
    }

    public sendErrorMessage(errorMessage: string | undefined, tabID: string, requestID: string | undefined) {
        this.showChatExceptionMessage(
            {
                errorMessage: errorMessage,
                sessionID: undefined,
                statusCode: undefined,
            },
            tabID,
            requestID
        )
    }

    private editorContextMenuCommandVerbs: Map<EditorContextCommandType, string> = new Map([
        ['aws.amazonq.explainCode', 'Explain'],
        ['aws.amazonq.explainIssue', 'Explain'],
        ['aws.amazonq.refactorCode', 'Refactor'],
        ['aws.amazonq.fixCode', 'Fix'],
        ['aws.amazonq.optimizeCode', 'Optimize'],
        ['aws.amazonq.sendToPrompt', 'Send to prompt'],
        ['aws.amazonq.generateUnitTests', 'Generate unit tests for'],
    ])

    public sendStaticTextResponse(type: StaticTextResponseType, triggerID: string, tabID: string) {
        let message
        let followUps
        let followUpsHeader
        switch (type) {
            case 'quick-action-help':
                message = helpMessage
                break
            case 'onboarding-help':
                message = `### What I can do:
                \n\n- Answer questions about AWS
                \n\n- Answer questions about general programming concepts
                \n\n- Explain what a line of code or code function does
                \n\n- Write unit tests and code
                \n\n- Debug and fix code
                \n\n- Refactor code`
                followUps = [
                    {
                        type: '',
                        pillText: 'Should I use AWS Lambda or EC2 for a scalable web application backend?',
                        prompt: 'Should I use AWS Lambda or EC2 for a scalable web application backend?',
                    },
                    {
                        type: '',
                        pillText: 'What is the syntax of declaring a variable in TypeScript?',
                        prompt: 'What is the syntax of declaring a variable in TypeScript?',
                    },
                    {
                        type: '',
                        pillText: 'Write code for uploading a file to an s3 bucket in typescript',
                        prompt: 'Write code for uploading a file to an s3 bucket in typescript',
                    },
                ]
                followUpsHeader = 'Try Examples:'
                break
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'answer',
                    followUpsHeader,
                    followUps,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: 'static_message_' + triggerID,
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                },
                tabID
            )
        )
    }

    public sendQuickActionMessage(quickAction: ChatPromptCommandType, triggerID: string) {
        let message = ''
        switch (quickAction) {
            case 'help':
                message = 'How can Amazon Q help me?'
                break
        }

        this.dispatcher.sendQuickActionMessage(
            new QuickActionMessage({
                message,
                triggerID,
            })
        )
    }

    public sendEditorContextCommandMessage(
        command: EditorContextCommandType,
        selectedCode: string,
        triggerID: string,
        issue?: CodeScanIssue
    ) {
        // Remove newlines and spaces before and after the code
        const trimmedCode = selectedCode.trimStart().trimEnd()

        let message
        if (command === 'aws.amazonq.sendToPrompt') {
            message = ['\n```\n', trimmedCode, '\n```'].join('')
        } else if (command === 'aws.amazonq.explainIssue' && issue) {
            message = [
                this.editorContextMenuCommandVerbs.get(command),
                ` the "${issue.title}" issue in the following code:`,
                '\n```\n',
                trimmedCode,
                '\n```',
            ].join('')
        } else {
            message = [
                this.editorContextMenuCommandVerbs.get(command),
                ' the following part of my code:',
                '\n```\n',
                trimmedCode,
                '\n```',
            ].join('')
        }

        this.dispatcher.sendEditorContextCommandMessage(
            new EditorContextCommandMessage({ message, triggerID, command })
        )
    }

    private showChatExceptionMessage(e: ChatException, tabID: string, requestID: string | undefined) {
        let message = 'This error is reported to the team automatically. We will attempt to fix it as soon as possible.'
        if (e.errorMessage !== undefined) {
            message += `\n\nDetails: ${e.errorMessage}`
        }

        if (e.statusCode !== undefined) {
            message += `\n\nStatus Code: ${e.statusCode}`
        }
        if (e.sessionID !== undefined) {
            message += `\n\nSession ID: ${e.sessionID}`
        }
        if (requestID !== undefined) {
            message += `\n\nRequest ID: ${requestID}`
        }

        this.dispatcher.sendErrorMessage(
            new ErrorMessage('An error occurred while processing your request.', message.trimEnd().trimStart(), tabID)
        )
    }

    public sendOpenSettingsMessage(triggerId: string, tabID: string) {
        this.dispatcher.sendOpenSettingsMessage(new OpenSettingsMessage(tabID))
    }
}
