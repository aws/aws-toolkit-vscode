/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeletedFileInfo, FollowUpTypes, NewFileInfo } from '../../../types'
import { AuthFollowUpType, AuthMessageDataMap } from '../../../../amazonq/auth/model'
import {
    ChatMessage,
    AsyncEventProgressMessage,
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
import { MessengerTypes } from './constants'
import { FeatureAuthState } from '../../../../codewhisperer'
import { CodeReference } from '../../../../codewhispererChat/view/connector/connector'
import { i18n } from '../../../../shared/i18n-helper'
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

    public sendFeedback(tabID: string) {
        this.sendAnswer({
            message: undefined,
            type: 'system-prompt',
            followUps: [
                {
                    pillText: i18n('AWS.amazonq.featureDev.pillText.sendFeedback'),
                    type: FollowUpTypes.SendFeedback,
                    status: 'info',
                },
            ],
            tabID,
        })
    }

    public sendMonthlyLimitError(tabID: string) {
        this.sendAnswer({
            type: 'answer',
            tabID: tabID,
            message: i18n('AWS.amazonq.featureDev.error.monthlyLimitReached'),
        })
        this.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.featureDev.placeholder.chatInputDisabled'))
    }

    public sendErrorMessage(
        errorMessage: string,
        tabID: string,
        retries: number,
        conversationId?: string,
        showDefaultMessage?: boolean
    ) {
        if (retries === 0) {
            this.sendAnswer({
                type: 'answer',
                tabID: tabID,
                message: showDefaultMessage ? errorMessage : i18n('AWS.amazonq.featureDev.error.technicalDifficulties'),
                canBeVoted: true,
            })
            this.sendFeedback(tabID)
            return
        }

        this.sendAnswer({
            type: 'answer',
            tabID: tabID,
            message: errorMessage + messageWithConversationId(conversationId),
        })

        this.sendAnswer({
            message: undefined,
            type: 'system-prompt',
            followUps: [
                {
                    pillText: i18n('AWS.amazonq.featureDev.pillText.retry'),
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
        uploadId: string,
        codeGenerationId: string
    ) {
        this.dispatcher.sendCodeResult(
            new CodeResultMessage(filePaths, deletedFiles, references, tabID, uploadId, codeGenerationId)
        )
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
