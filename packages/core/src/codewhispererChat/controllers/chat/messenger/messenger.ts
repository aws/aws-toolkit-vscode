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
    QuickActionMessage,
} from '../../../view/connector/connector'
import { EditorContextCommandType } from '../../../commands/registerCommands'
import {
    CodeWhispererStreamingServiceException,
    GenerateAssistantResponseCommandOutput,
    SupplementaryWebLink,
} from '@amzn/codewhisperer-streaming'
import { ChatMessage, ErrorMessage, FollowUp, Suggestion } from '../../../view/connector/connector'
import { ChatSession } from '../../../clients/chat/v0/chat'
import { ChatException } from './model'
import { CWCTelemetryHelper } from '../telemetryHelper'
import { ChatPromptCommandType, TriggerPayload } from '../model'
import { ToolkitError } from '../../../../shared/errors'
import { keys } from '../../../../shared/utilities/tsUtils'
import { getLogger } from '../../../../shared/logger/logger'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import { AuthFollowUpType, expiredText, enableQText, reauthenticateText } from '../../../../amazonq/auth/model'
import { userGuideURL } from '../../../../amazonq/webview/ui/texts/constants'

export type StaticTextResponseType = 'quick-action-help' | 'onboarding-help' | 'transform' | 'help'

export class Messenger {
    public constructor(
        private readonly dispatcher: AppToWebViewMessageDispatcher,
        private readonly telemetryHelper: CWCTelemetryHelper
    ) {}

    public async sendAuthNeededExceptionMessage(credentialState: FeatureAuthState, tabID: string, triggerID: string) {
        let authType: AuthFollowUpType = 'full-auth'
        let message = reauthenticateText
        if (
            credentialState.codewhispererChat === 'disconnected' &&
            credentialState.codewhispererCore === 'disconnected'
        ) {
            authType = 'full-auth'
            message = reauthenticateText
        }

        if (credentialState.codewhispererCore === 'connected' && credentialState.codewhispererChat === 'expired') {
            authType = 'missing_scopes'
            message = enableQText
        }

        if (credentialState.codewhispererChat === 'expired' && credentialState.codewhispererCore === 'expired') {
            authType = 're-auth'
            message = expiredText
        }

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
                },
                tabID
            )
        )
    }
    public async sendAIResponse(
        response: GenerateAssistantResponseCommandOutput,
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

        if (response.generateAssistantResponseResponse === undefined) {
            throw new ToolkitError(
                `Empty response from CodeWhisperer Streaming service. Request ID: ${response.$metadata.requestId}`
            )
        }
        this.telemetryHelper.setResponseStreamStartTime(tabID)

        const eventCounts = new Map<string, number>()
        waitUntil(
            async () => {
                for await (const chatEvent of response.generateAssistantResponseResponse!) {
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
                            ...chatEvent.codeReferenceEvent.references.map(reference => ({
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
                    statusCode = error.$metadata?.httpStatusCode ?? 0
                    requestID = error.$metadata.requestId
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
            .finally(() => {
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
        ['aws.amazonq.refactorCode', 'Refactor'],
        ['aws.amazonq.fixCode', 'Fix'],
        ['aws.amazonq.optimizeCode', 'Optimize'],
        ['aws.amazonq.sendToPrompt', 'Send to prompt'],
    ])

    public sendStaticTextResponse(type: StaticTextResponseType, triggerID: string, tabID: string) {
        let message
        let followUps
        let followUpsHeader
        switch (type) {
            case 'quick-action-help':
                message = `I'm Amazon Q, a generative AI assistant. Learn more about me below. Your feedback will help me improve.
                \n\n### What I can do:                
                \n\n- Answer questions about AWS
                \n\n- Answer questions about general programming concepts
                \n\n- Explain what a line of code or code function does
                \n\n- Write unit tests and code
                \n\n- Debug and fix code
                \n\n- Refactor code                 
                \n\n### What I don't do right now:                
                \n\n- Answer questions in languages other than English
                \n\n- Remember conversations from your previous sessions
                \n\n- Have information about your AWS account or your specific AWS resources                
                \n\n### Examples of questions I can answer:                
                \n\n- When should I use ElastiCache?
                \n\n- How do I create an Application Load Balancer?
                \n\n- Explain the <selected code> and ask clarifying questions about it. 
                \n\n- What is the syntax of declaring a variable in TypeScript?                
                \n\n### Special Commands                
                \n\n- /clear - Clear the conversation.
                \n\n- /dev - Get code suggestions across files in your current project. Provide a brief prompt, such as "Implement a GET API."<strong> Only available through CodeWhisperer Professional Tier.</strong>
                \n\n- /transform - Transform your code. Use to upgrade Java code versions. <strong>Only available through CodeWhisperer Professional Tier.</strong>
                \n\n- /help - View chat topics and commands.                             
                \n\n### Things to note:                
                \n\n- I may not always provide completely accurate or current information. 
                \n\n- Provide feedback by choosing the like or dislike buttons that appear below answers.
                \n\n- When you use Amazon Q, AWS may, for service improvement purposes, store data about your usage and content. You can opt-out of sharing this data by following the steps in AI services opt-out policies. See <a href="https://docs.aws.amazon.com/codewhisperer/latest/userguide/sharing-data.html">here</a>
                \n\n- Do not enter any confidential, sensitive, or personal information.                
                \n\n*For additional help, visit the [Amazon Q User Guide](${userGuideURL}).*`
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
                },
                tabID
            )
        )
    }

    public sendQuickActionMessage(quickAction: ChatPromptCommandType, triggerID: string) {
        let message = ''
        switch (quickAction) {
            case 'help':
                message = 'What can Amazon Q help me with?'
                break
        }

        this.dispatcher.sendQuickActionMessage(
            new QuickActionMessage({
                message,
                triggerID,
            })
        )
    }

    public sendEditorContextCommandMessage(command: EditorContextCommandType, selectedCode: string, triggerID: string) {
        // Remove newlines and spaces before and after the code
        const trimmedCode = selectedCode.trimStart().trimEnd()

        let message
        if (command === 'aws.amazonq.sendToPrompt') {
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
