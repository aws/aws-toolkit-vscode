/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitUntil } from '../../../../shared/utilities/timeoutUtils'
import {
    AppToWebViewMessageDispatcher,
    CodeReference,
    EditorContextCommandMessage,
} from '../../../view/connector/connector'
import { EditorContextCommandType } from '../../../commands/registerCommands'
import { GenerateAssistantResponseCommandOutput, SupplementaryWebLink } from '@amzn/codewhisperer-streaming'
import { ChatMessage, ErrorMessage, FollowUp, Suggestion } from '../../../view/connector/connector'
import { ChatSession } from '../../../clients/chat/v0/chat'
import { ChatException } from './model'
import { CWCTelemetryHelper } from '../telemetryHelper'
import { TriggerPayload } from '../model'
import { ToolkitError } from '../../../../shared/errors'

export class Messenger {
    public constructor(
        private readonly dispatcher: AppToWebViewMessageDispatcher,
        private readonly telemetryHelper: CWCTelemetryHelper
    ) {}

    async sendAIResponse(
        response: GenerateAssistantResponseCommandOutput,
        session: ChatSession,
        tabID: string,
        triggerID: string,
        triggerPayload: TriggerPayload
    ) {
        let message = ''
        const messageID = response.$metadata.requestId ?? ''
        let codeReference: CodeReference[] = []
        const followUps: FollowUp[] = []
        const relatedSuggestions: Suggestion[] = []

        if (response.generateAssistantResponseResponse === undefined) {
            throw new ToolkitError(
                `Empty response from CodeWhisperer Streaming service. Request ID: ${response.$metadata.requestId}`
            )
        }

        this.dispatcher.sendChatMessage(
            // TODO This one somehow doesn't return immediately to the client,
            // stucks on the await process,
            // We need to solve it from here
            // then we can remove the unnecessary addition on the UI side
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer-stream',
                    followUps: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: messageID,
                },
                tabID
            )
        )
        this.telemetryHelper.setResponseStreamStartTime(tabID)

        await waitUntil(
            async () => {
                for await (const chatEvent of response.generateAssistantResponseResponse!) {
                    if (session.tokenSource.token.isCancellationRequested) {
                        return true
                    }

                    if (
                        chatEvent.codeReferenceEvent?.references !== undefined &&
                        chatEvent.codeReferenceEvent.references.length > 0
                    ) {
                        codeReference = chatEvent.codeReferenceEvent.references.map(reference => ({
                            ...reference,
                            recommendationContentSpan: {
                                start: reference.recommendationContentSpan?.start ?? 0,
                                end: reference.recommendationContentSpan?.end ?? 0,
                            },
                            information: `Reference code under **${reference.licenseName}** license from repository \`${reference.repository}\``,
                        }))
                    }

                    if (
                        chatEvent.assistantResponseEvent?.content !== undefined &&
                        chatEvent.assistantResponseEvent.content.length > 0
                    ) {
                        message += chatEvent.assistantResponseEvent.content

                        this.dispatcher.sendChatMessage(
                            new ChatMessage(
                                {
                                    message: message,
                                    messageType: 'answer-part',
                                    followUps: undefined,
                                    relatedSuggestions: undefined,
                                    codeReference,
                                    triggerID,
                                    messageID,
                                },
                                tabID
                            )
                        )
                        this.telemetryHelper.setReponseStreamTimeToFirstChunk(tabID)
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

        if (relatedSuggestions.length !== 0) {
            this.dispatcher.sendChatMessage(
                new ChatMessage(
                    {
                        message: undefined,
                        messageType: 'answer-part',
                        followUps: undefined,
                        relatedSuggestions,
                        triggerID,
                        messageID,
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
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID,
                },
                tabID
            )
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
        ['aws.awsq.explainCode', 'Explain'],
        ['aws.awsq.refactorCode', 'Refactor'],
        ['aws.awsq.fixCode', 'Fix'],
        ['aws.awsq.optimizeCode', 'Optimize'],
        ['aws.awsq.sendToPrompt', 'Send to prompt'],
    ])

    public sendEditorContextCommandMessage(command: EditorContextCommandType, selectedCode: string, triggerID: string) {
        // Remove newlines and spaces before and after the code
        const trimmedCode = selectedCode.trimStart().trimEnd()

        let message
        if (command === 'aws.awsq.sendToPrompt') {
            message = ['\n```\n', trimmedCode, '\n```'].join('')
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
}
