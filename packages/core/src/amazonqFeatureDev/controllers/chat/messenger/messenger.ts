/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeletedFileInfo, FollowUpTypes, NewFileInfo, SessionStatePhase } from '../../../types'
import { CodeReference } from '../../../../amazonq/webview/ui/apps/amazonqCommonsConnector'
import { AuthFollowUpType, AuthMessageDataMap } from '../../../../amazonq/auth/model'
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
import { messageWithConversationId } from '../../../userFacingText'
import { MessengerTypes, ErrorMessages, Placeholders } from './constants'
export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    public sendAnswer(params: {
        message?: string
        type: MessengerTypes
        followUps?: ChatItemAction[]
        tabID: string
        canBeVoted?: boolean
        snapToTop?: boolean
    }) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: params.message,
                    messageType: params.type,
                    followUps: params.followUps,
                    relatedSuggestions: undefined,
                    canBeVoted: params.canBeVoted ?? false,
                    snapToTop: params.snapToTop ?? false,
                },
                params.tabID
            )
        )
    }

    public sendMonthlyLimitError(tabID: string) {
        this.sendAnswer({
            type: 'answer',
            tabID: tabID,
            message: ErrorMessages.monthlyLimitReached,
        })
        this.sendUpdatePlaceholder(tabID, Placeholders.chatInputDisabled)
    }

    public sendErrorMessage(
        errorMessage: string,
        tabID: string,
        retries: number,
        phase?: SessionStatePhase,
        conversationId?: string
    ) {
        if (retries === 0) {
            this.sendAnswer({
                type: 'answer',
                tabID: tabID,
                message: ErrorMessages.technicalDifficulties,
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
                        ErrorMessages.tryAgain,
                        errorMessage + messageWithConversationId(conversationId),
                        tabID
                    )
                )
                break
            case 'Codegen':
                this.dispatcher.sendErrorMessage(
                    new ErrorMessage(
                        ErrorMessages.tryAgain,
                        errorMessage + messageWithConversationId(conversationId),
                        tabID
                    )
                )
                break
            default:
                // used to send generic error messages when we don't want to send the response as part of a phase
                this.dispatcher.sendErrorMessage(
                    new ErrorMessage(
                        ErrorMessages.processingIssue,
                        errorMessage + messageWithConversationId(conversationId),
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

    public updateFileComponent(
        tabID: string,
        filePaths: NewFileInfo[],
        deletedFiles: DeletedFileInfo[],
        messageId: string
    ) {
        this.dispatcher.updateFileComponent(new FileComponent(tabID, filePaths, deletedFiles, messageId))
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
        let message = AuthMessageDataMap[authType].message

        switch (credentialState.amazonQ) {
            case 'disconnected':
                authType = 'full-auth'
                message = AuthMessageDataMap[authType].message
                break
            case 'unsupported':
                authType = 'use-supported-auth'
                message = AuthMessageDataMap[authType].message
                break
            case 'expired':
                authType = 're-auth'
                message = AuthMessageDataMap[authType].message
                break
        }

        this.dispatcher.sendAuthNeededExceptionMessage(new AuthNeededException(message, authType, tabID))
    }

    public openNewTask() {
        this.dispatcher.sendOpenNewTask(new OpenNewTabMessage())
    }
}
