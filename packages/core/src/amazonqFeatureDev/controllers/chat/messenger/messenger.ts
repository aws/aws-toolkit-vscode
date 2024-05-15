/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeletedFileInfo, FollowUpTypes, NewFileInfo, SessionStatePhase } from '../../../types'
import { CodeReference } from '../../../../amazonq/webview/ui/apps/amazonqCommonsConnector'
import { AuthFollowUpType, expiredText, enableQText, reauthenticateText } from '../../../../amazonq/auth/model'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import {
    ChatMessage,
    AsyncEventProgressMessage,
    ErrorMessage,
    CodeResultMessage,
    UpdatePlaceholderMessage,
    ChatInputEnabledMessage,
    AuthenticationUpdateMessage,
    AuthNeededException,
    OpenNewTabMessage,
    FileComponent,
} from '../../../views/connector/connector'
import { AppToWebViewMessageDispatcher } from '../../../views/connector/connector'
import { ChatItemAction } from '@aws/mynah-ui'

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    public sendAnswer(params: {
        message?: string
        type: 'answer' | 'answer-part' | 'answer-stream' | 'system-prompt'
        followUps?: ChatItemAction[]
        tabID: string
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
                params.tabID
            )
        )
    }

    public sendMonthlyLimitError(tabID: string) {
        this.sendAnswer({
            type: 'answer',
            tabID: tabID,
            message: `Sorry, you have reached the monthly limit for feature development. You can try again next month.`,
        })
        this.sendUpdatePlaceholder(tabID, 'Chat input is disabled')
    }

    public sendErrorMessage(errorMessage: string, tabID: string, retries: number, phase?: SessionStatePhase) {
        if (retries === 0) {
            this.sendAnswer({
                type: 'answer',
                tabID: tabID,
                message: `I'm sorry, I'm having technical difficulties and can't continue at the moment. Please try again later, and share feedback to help me improve.`,
            })
            this.sendAnswer({
                message: undefined,
                type: 'system-prompt',
                followUps: [
                    {
                        pillText: 'Send feedback',
                        type: FollowUpTypes.SendFeedback,
                        status: 'info',
                    },
                ],
                tabID,
            })
            return
        }

        switch (phase) {
            case 'Approach':
                this.dispatcher.sendErrorMessage(
                    new ErrorMessage(
                        `Sorry, we're experiencing an issue on our side. Would you like to try again?`,
                        errorMessage,
                        tabID
                    )
                )
                break
            case 'Codegen':
                this.dispatcher.sendErrorMessage(
                    new ErrorMessage(
                        `Sorry, we're experiencing an issue on our side. Would you like to try again?`,
                        errorMessage,
                        tabID
                    )
                )
                break
            default:
                // used to send generic error messages when we don't want to send the response as part of a phase
                this.dispatcher.sendErrorMessage(
                    new ErrorMessage(
                        `Sorry, we encountered a problem when processing your request.`,
                        errorMessage,
                        tabID
                    )
                )
                break
        }

        this.sendAnswer({
            message: undefined,
            type: 'system-prompt',
            followUps: [
                {
                    pillText: 'Retry',
                    type: FollowUpTypes.Retry,
                    status: 'warning',
                },
            ],
            tabID,
        })
    }

    public sendCodeResult(
        filePaths: NewFileInfo[],
        deletedFiles: DeletedFileInfo[],
        references: CodeReference[],
        tabID: string,
        uploadId: string
    ) {
        this.dispatcher.sendCodeResult(new CodeResultMessage(filePaths, deletedFiles, references, tabID, uploadId))
    }

    public sendAsyncEventProgress(tabID: string, inProgress: boolean, message: string | undefined) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, inProgress, message))
    }

    public updateFileComponent(tabID: string, filePaths: NewFileInfo[], deletedFiles: DeletedFileInfo[]) {
        this.dispatcher.updateFileComponent(new FileComponent(tabID, filePaths, deletedFiles))
    }

    public sendUpdatePlaceholder(tabID: string, newPlaceholder: string) {
        this.dispatcher.sendPlaceholder(new UpdatePlaceholderMessage(tabID, newPlaceholder))
    }

    public sendChatInputEnabled(tabID: string, enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(tabID, enabled))
    }

    public sendAuthenticationUpdate(featureDevEnabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(
            new AuthenticationUpdateMessage(featureDevEnabled, authenticatingTabIDs)
        )
    }

    public async sendAuthNeededExceptionMessage(credentialState: FeatureAuthState, tabID: string) {
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

        this.dispatcher.sendAuthNeededExceptionMessage(new AuthNeededException(message, authType, tabID))
    }

    public openNewTask() {
        this.dispatcher.sendOpenNewTask(new OpenNewTabMessage())
    }
}
