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
    OnboardingPageInteractionMessage,
    QuickActionMessage,
} from '../../../view/connector/connector'
import { EditorContextCommandType } from '../../../commands/registerCommands'
import { GenerateAssistantResponseCommandOutput, SupplementaryWebLink } from '@amzn/codewhisperer-streaming'
import { ChatMessage, ErrorMessage, FollowUp, Suggestion } from '../../../view/connector/connector'
import { ChatSession } from '../../../clients/chat/v0/chat'
import { ChatException } from './model'
import { CWCTelemetryHelper } from '../telemetryHelper'
import { ChatPromptCommandType, TriggerPayload } from '../model'
import { ToolkitError } from '../../../../shared/errors'
import { keys } from '../../../../shared/utilities/tsUtils'
import { getLogger } from '../../../../shared/logger/logger'
import { OnboardingPageInteraction } from '../../../../amazonq/onboardingPage/model'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import { AuthFollowUpType, expiredText, enableQText, reauthenticateText } from '../../../../amazonq/auth/model'

export type StaticTextResponseType = 'help'

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
        const followUps: FollowUp[] = []
        const relatedSuggestions: Suggestion[] = []

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
                                    relatedSuggestions: undefined,
                                    codeReference,
                                    triggerID,
                                    messageID,
                                },
                                tabID
                            )
                        )
                        this.telemetryHelper.setResponseStreamTimeToFirstChunk(tabID)
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
        ).finally(() => {
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
        switch (type) {
            case 'help':
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
                \n\n- /dev - Get code suggestions across files in your current project. Provide a brief prompt, such as "Implement a GET API."
                \n\n- /transform - Transform your code. Use to upgrade Java code versions.
                \n\n- /help - View chat topics and commands.
                \n\n- Right click context menu to ask Amazon Q about a piece of selected code
                \n\n- Right-click a highlighted code snippet to open a context menu with actions                 
                \n\n### Things to note:                
                \n\n- I may not always provide completely accurate or current information. 
                \n\n- Provide feedback by choosing the like or dislike buttons that appear below answers.
                \n\n- By default, your conversation data is stored to help improve my answers. You can opt-out of sharing this data by following the steps in AI services opt-out policies.
                \n\n- Do not enter any confidential, sensitive, or personal information.                
                \n\n*For additional help, visit the Amazon Q User Guide.*`
                break
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'answer',
                    followUps: undefined,
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
                message = 'What can Amazon Q (Preview) help me with?'
                break
        }

        this.dispatcher.sendQuickActionMessage(
            new QuickActionMessage({
                message,
                triggerID,
            })
        )
    }

    public sendOnboardingPageInteractionMessage(interaction: OnboardingPageInteraction, triggerID: string) {
        let message
        switch (interaction.type) {
            case 'onboarding-page-cwc-button-clicked':
                message = 'What can Amazon Q (Preview) help me with?'
                break
        }

        this.dispatcher.sendOnboardingPageInteractionMessage(
            new OnboardingPageInteractionMessage({
                message,
                interactionType: interaction.type,
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

        message += `\n\nPlease create a ticket [here](https://issues.amazon.com/issues/create?template=70dc0f1b-c867-4b8d-b54c-2c13bec80a04) with a screenshot of this error and a copy of the logs.`

        this.dispatcher.sendErrorMessage(
            new ErrorMessage('An error occurred while processing your request.', message.trimEnd().trimStart(), tabID)
        )
    }
}
