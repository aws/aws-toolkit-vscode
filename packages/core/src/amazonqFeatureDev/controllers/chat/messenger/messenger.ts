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
    /**
     * Creates an instance of Messenger.
     * @constructor
     * @param {AppToWebViewMessageDispatcher} dispatcher - The dispatcher for sending messages to the web view.
     */
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    /**
     * Sends an answer message to the web view.
     * @param {Object} params - The parameters for the answer message.
     * @param {string} [params.message] - The message content.
     * @param {MessengerTypes} params.type - The type of the message.
     * @param {ChatItemAction[]} [params.followUps] - The follow-up actions for the message.
     * @param {string} params.tabID - The ID of the tab to send the message to.
     * @param {boolean} [params.canBeVoted] - Whether the message can be voted on.
     * @param {boolean} [params.snapToTop] - Whether the message should snap to the top of the view.
     */
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

    /**
     * Sends a feedback prompt to the user.
     * @param {string} tabID - The ID of the tab to send the feedback prompt to.
     */
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

    /**
     * Sends a monthly limit error message.
     * @param {string} tabID - The ID of the tab to send the error message to.
     */
    public sendMonthlyLimitError(tabID: string) {
        this.sendAnswer({
            type: 'answer',
            tabID: tabID,
            message: i18n('AWS.amazonq.featureDev.error.monthlyLimitReached'),
        })
        this.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.featureDev.placeholder.chatInputDisabled'))
    }

    /**
     * Sends an error message to the user.
     * @param {string} errorMessage - The error message to send.
     * @param {string} tabID - The ID of the tab to send the error message to.
     * @param {number} retries - The number of retries left.
     * @param {string} [conversationId] - The ID of the conversation.
     * @param {boolean} [showDefaultMessage] - Whether to show the default message or the provided error message.
     */
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

    /**
     * Sends a code result message.
     * @param {NewFileInfo[]} filePaths - Array of new file information.
     * @param {DeletedFileInfo[]} deletedFiles - Array of deleted file information.
     * @param {CodeReference[]} references - Array of code references.
     * @param {string} tabID - The ID of the tab to send the code result to.
     * @param {string} uploadId - The ID of the upload.
     */
    public sendCodeResult(
        filePaths: NewFileInfo[],
        deletedFiles: DeletedFileInfo[],
        references: CodeReference[],
        tabID: string,
        uploadId: string
    ) {
        this.dispatcher.sendCodeResult(new CodeResultMessage(filePaths, deletedFiles, references, tabID, uploadId))
    }

    /**
     * Sends an asynchronous event progress message.
     * @param {string} tabID - The ID of the tab to send the progress message to.
     * @param {boolean} inProgress - Whether the event is in progress.
     * @param {string | undefined} message - The progress message.
     */
    public sendAsyncEventProgress(tabID: string, inProgress: boolean, message: string | undefined) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, inProgress, message))
    }

    /**
     * Updates the file component in the UI.
     * @param {string} tabID - The ID of the tab to update.
     * @param {NewFileInfo[]} filePaths - Array of new file information.
     * @param {DeletedFileInfo[]} deletedFiles - Array of deleted file information.
     * @param {string} messageId - The ID of the message.
     */
    public updateFileComponent(
        tabID: string,
        filePaths: NewFileInfo[],
        deletedFiles: DeletedFileInfo[],
        messageId: string
    ) {
        this.dispatcher.updateFileComponent(new FileComponent(tabID, filePaths, deletedFiles, messageId))
    }

    /**
     * Sends an update to the placeholder text.
     * @param {string} tabID - The ID of the tab to update.
     * @param {string} newPlaceholder - The new placeholder text.
     */
    public sendUpdatePlaceholder(tabID: string, newPlaceholder: string) {
        this.dispatcher.sendPlaceholder(new UpdatePlaceholderMessage(tabID, newPlaceholder))
    }

    /**
     * Sends a message to enable or disable chat input.
     * @param {string} tabID - The ID of the tab to update.
     * @param {boolean} enabled - Whether the chat input should be enabled.
     */
    public sendChatInputEnabled(tabID: string, enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(tabID, enabled))
    }

    /**
     * Sends an authentication update message.
     * @param {boolean} featureDevEnabled - Whether the feature development is enabled.
     * @param {string[]} authenticatingTabIDs - Array of tab IDs that are authenticating.
     */
    public sendAuthenticationUpdate(featureDevEnabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(
            new AuthenticationUpdateMessage(featureDevEnabled, authenticatingTabIDs)
        )
    }

    /**
     * Sends an authentication needed exception message.
     * @param {FeatureAuthState} credentialState - The current credential state.
     * @param {string} tabID - The ID of the tab to send the message to.
     */
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

    /**
     * Opens a new task tab.
     */
    public openNewTask() {
        this.dispatcher.sendOpenNewTask(new OpenNewTabMessage())
    }
}
