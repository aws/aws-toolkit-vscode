/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemAction, ProgressField } from '@aws/mynah-ui'
import { AuthFollowUpType, AuthMessageDataMap } from '../../../amazonq/auth/model'
import { i18n } from '../../../shared/i18n-helper'
import { CodeReference } from '../../../amazonq/webview/ui/connector'

import { MessengerTypes } from '../../../amazonqFeatureDev/controllers/chat/messenger/constants'
import {
    AppToWebViewMessageDispatcher,
    AsyncEventProgressMessage,
    AuthenticationUpdateMessage,
    AuthNeededException,
    ChatInputEnabledMessage,
    ChatMessage,
    CodeResultMessage,
    FileComponent,
    FolderConfirmationMessage,
    OpenNewTabMessage,
    UpdateAnswerMessage,
    UpdatePlaceholderMessage,
    UpdatePromptProgressMessage,
} from './connectorMessages'
import { DeletedFileInfo, FollowUpTypes, NewFileInfo } from '../types'
import { messageWithConversationId } from '../../../amazonqFeatureDev/userFacingText'
import { FeatureAuthState } from '../../../codewhisperer/util/authUtil'

export class Messenger {
    public constructor(
        private readonly dispatcher: AppToWebViewMessageDispatcher,
        private readonly sender: string
    ) {}

    public sendAnswer(params: {
        message?: string
        type: MessengerTypes
        followUps?: ChatItemAction[]
        tabID: string
        canBeVoted?: boolean
        snapToTop?: boolean
        messageId?: string
        disableChatInput?: boolean
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
                    messageId: params.messageId,
                },
                params.tabID,
                this.sender
            )
        )
        if (params.disableChatInput) {
            this.sendChatInputEnabled(params.tabID, false)
        }
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
            disableChatInput: true,
        })
        this.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.featureDev.placeholder.chatInputDisabled'))
    }

    public sendUpdatePromptProgress(tabID: string, progressField: ProgressField | null) {
        this.dispatcher.sendUpdatePromptProgress(new UpdatePromptProgressMessage(tabID, this.sender, progressField))
    }

    public sendFolderConfirmationMessage(
        tabID: string,
        message: string,
        folderPath: string,
        followUps?: ChatItemAction[]
    ) {
        this.dispatcher.sendFolderConfirmationMessage(
            new FolderConfirmationMessage(tabID, this.sender, message, folderPath, followUps)
        )

        this.sendChatInputEnabled(tabID, false)
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
            new CodeResultMessage(filePaths, deletedFiles, references, tabID, this.sender, uploadId, codeGenerationId)
        )
    }

    public sendAsyncEventProgress(tabID: string, inProgress: boolean, message: string | undefined) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, this.sender, inProgress, message))
    }

    public updateFileComponent(
        tabID: string,
        filePaths: NewFileInfo[],
        deletedFiles: DeletedFileInfo[],
        messageId: string,
        disableFileActions: boolean
    ) {
        this.dispatcher.updateFileComponent(
            new FileComponent(tabID, this.sender, filePaths, deletedFiles, messageId, disableFileActions)
        )
    }

    public updateChatAnswer(message: UpdateAnswerMessage) {
        this.dispatcher.updateChatAnswer(message)
    }

    public sendUpdatePlaceholder(tabID: string, newPlaceholder: string) {
        this.dispatcher.sendPlaceholder(new UpdatePlaceholderMessage(tabID, this.sender, newPlaceholder))
    }

    public sendChatInputEnabled(tabID: string, enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(tabID, this.sender, enabled))
    }

    public sendAuthenticationUpdate(enabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(
            new AuthenticationUpdateMessage(this.sender, enabled, authenticatingTabIDs)
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

        this.dispatcher.sendAuthNeededExceptionMessage(new AuthNeededException(message, authType, tabID, this.sender))
    }

    public openNewTask() {
        this.dispatcher.sendOpenNewTask(new OpenNewTabMessage(this.sender))
    }
}
