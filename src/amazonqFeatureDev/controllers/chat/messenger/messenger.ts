/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FollowUpTypes, SessionStatePhase } from '../../../types'
import { AuthFollowUpType, expiredText, enableQText, reauthenticateText } from '../../../../amazonq/auth/model'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import {
    ChatMessage,
    AsyncEventProgressMessage,
    ErrorMessage,
    UpdatePlaceholderMessage,
    ChatInputEnabledMessage,
    AuthenticationUpdateMessage,
    AuthNeededException,
    OpenNewTabMessage,
} from '../../../views/connector/connector'
import { AppToWebViewMessageDispatcher } from '../../../views/connector/connector'
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'
import { MessagePublisher } from '../../../../amazonq/messages/messagePublisher'

export type MessengerFactory = (tabID: string) => Messenger

export function createMessengerFactory(publisher: MessagePublisher<any>): MessengerFactory {
    return (tabID: string) => new Messenger(new AppToWebViewMessageDispatcher(publisher), tabID)
}

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher, private readonly tabID: string) {}

    // For sending a generic message/resolving answer streams
    public sendAnswer(params: { message?: string; followUps?: ChatItemFollowUp[]; canBeVoted?: boolean }) {
        this.sendChatMessage({
            type: 'answer',
            ...params,
        })
    }

    // For resolving an open answer stream with content
    public sendAnswerPart(params: { message?: string; followUps?: ChatItemFollowUp[]; canBeVoted?: boolean }) {
        this.sendChatMessage({
            type: 'answer-part',
            ...params,
        })
    }

    // For showing information on the right side
    public sendSystemPrompt(params: { message?: string; followUps?: ChatItemFollowUp[]; canBeVoted?: boolean }) {
        this.sendChatMessage({
            type: 'system-prompt',
            ...params,
        })
    }

    private sendChatMessage(params: {
        message?: string
        type: 'answer' | 'answer-part' | 'system-prompt'
        followUps?: ChatItemFollowUp[]
        canBeVoted?: boolean
    }) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: params.message,
                    messageType: params.type,
                    followUps: params.followUps,
                    relatedSuggestions: undefined,
                    canBeVoted: params.canBeVoted ?? false,
                },
                this.tabID
            )
        )
    }

    public sendErrorMessage(errorMessage: string, retries: number, phase?: SessionStatePhase) {
        if (retries === 0) {
            this.dispatcher.sendErrorMessage(
                new ErrorMessage(
                    `Sorry, we're unable to provide a response at this time. Please try again later or share feedback with our team to help us troubleshoot.`,
                    errorMessage,
                    this.tabID
                )
            )
            this.sendSystemPrompt({
                message: undefined,
                followUps: [
                    {
                        pillText: 'Send feedback',
                        type: FollowUpTypes.SendFeedback,
                        status: 'info',
                    },
                ],
            })
            return
        }

        switch (phase) {
            case 'Approach':
                this.dispatcher.sendErrorMessage(
                    new ErrorMessage(
                        `Sorry, we're experiencing an issue on our side. Would you like to try again?`,
                        errorMessage,
                        this.tabID
                    )
                )
                break
            default:
                // used to send generic error messages when we don't want to send the response as part of a phase
                this.dispatcher.sendErrorMessage(
                    new ErrorMessage(
                        `Sorry, we encountered a problem when processing your request.`,
                        errorMessage,
                        this.tabID
                    )
                )
                break
        }

        this.sendSystemPrompt({
            message: undefined,
            followUps: [
                {
                    pillText: 'Retry',
                    type: FollowUpTypes.Retry,
                    status: 'warning',
                },
            ],
        })
    }

    public sendAsyncEventProgress(inProgress: boolean, message: string | undefined) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(this.tabID, inProgress, message))
    }

    public sendUpdatePlaceholder(newPlaceholder: string) {
        this.dispatcher.sendPlaceholder(new UpdatePlaceholderMessage(this.tabID, newPlaceholder))
    }

    public sendChatInputEnabled(enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(this.tabID, enabled))
    }

    public sendAuthenticationUpdate(featureDevEnabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(
            new AuthenticationUpdateMessage(featureDevEnabled, authenticatingTabIDs)
        )
    }

    public async sendAuthNeededExceptionMessage(credentialState: FeatureAuthState) {
        let authType: AuthFollowUpType = 'full-auth'
        let message = reauthenticateText
        if (credentialState.amazonQ === 'disconnected') {
            authType = 'full-auth'
            message = reauthenticateText
        }

        if (credentialState.amazonQ === 'unsupported') {
            authType = 'use-supported-auth'
            message = enableQText
        }

        if (credentialState.amazonQ === 'expired') {
            authType = 're-auth'
            message = expiredText
        }

        this.dispatcher.sendAuthNeededExceptionMessage(new AuthNeededException(message, authType, this.tabID))
    }

    public openNewTask() {
        this.dispatcher.sendOpenNewTask(new OpenNewTabMessage())
    }
}
