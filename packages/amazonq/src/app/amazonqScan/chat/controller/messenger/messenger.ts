/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class controls the presentation of the various chat bubbles presented by the
 * Q Security Scans.
 *
 * As much as possible, all strings used in the experience should originate here.
 */

import { AuthFollowUpType, AuthMessageDataMap } from 'aws-core-vscode/amazonq'
import {
    SecurityScanError,
    CodeWhispererConstants,
    SecurityScanStep,
    DefaultCodeScanErrorMessage,
} from 'aws-core-vscode/codewhisperer'
import { ChatItemButton, ProgressField } from '@aws/mynah-ui/dist/static'
import { MynahIcons, ChatItemAction } from '@aws/mynah-ui'
import { ChatItemType } from 'aws-core-vscode/amazonq'
import {
    AppToWebViewMessageDispatcher,
    AuthNeededException,
    AuthenticationUpdateMessage,
    CapabilityCardMessage,
    ChatInputEnabledMessage,
    ChatMessage,
    ChatPrompt,
    ErrorMessage,
    UpdatePlaceholderMessage,
    UpdatePromptProgressMessage,
} from '../../views/connector/connector'
import { i18n } from 'aws-core-vscode/shared'
import { ScanAction, scanProgressMessage } from '../../../models/constants'
import path from 'path'
import { auth2 } from 'aws-core-vscode/auth'

export type UnrecoverableErrorType = 'no-project-found' | 'no-open-file-found' | 'invalid-file-type'

export enum ScanNamedMessages {
    SCAN_SUBMISSION_STATUS_MESSAGE = 'scanSubmissionMessage',
}

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    public sendAnswer(params: {
        message?: string
        type: ChatItemType
        tabID: string
        messageID?: string
        followUps?: ChatItemAction[]
        canBeVoted?: boolean
    }) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: params.message,
                    messageType: params.type,
                    messageId: params.messageID,
                    followUps: params.followUps,
                    canBeVoted: true,
                },
                params.tabID
            )
        )
    }

    public sendChatInputEnabled(tabID: string, enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(tabID, enabled))
    }

    public sendUpdatePlaceholder(tabID: string, newPlaceholder: string) {
        this.dispatcher.sendUpdatePlaceholder(new UpdatePlaceholderMessage(tabID, newPlaceholder))
    }

    public sendUpdatePromptProgress(tabID: string, progressField: ProgressField | null) {
        this.dispatcher.sendUpdatePromptProgress(new UpdatePromptProgressMessage(tabID, progressField))
    }

    public async sendAuthNeededExceptionMessage(credentialState: auth2.AuthState, tabID: string) {
        let authType: AuthFollowUpType = 'full-auth'
        let message = AuthMessageDataMap[authType].message

        switch (credentialState) {
            case 'notConnected':
                authType = 'full-auth'
                message = AuthMessageDataMap[authType].message
                break
            case 'expired':
                authType = 're-auth'
                message = AuthMessageDataMap[authType].message
                break
        }

        this.dispatcher.sendAuthNeededExceptionMessage(new AuthNeededException(message, authType, tabID))
    }

    public sendAuthenticationUpdate(scanEnabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(new AuthenticationUpdateMessage(scanEnabled, authenticatingTabIDs))
    }

    public sendScanInProgress(params: {
        message?: string
        type: ChatItemType
        tabID: string
        messageID?: string
        canBeVoted?: boolean
    }) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: params.message,
                    messageType: params.type,
                    messageId: ScanNamedMessages.SCAN_SUBMISSION_STATUS_MESSAGE,
                    canBeVoted: params.canBeVoted,
                },
                params.tabID
            )
        )
    }

    public sendErrorMessage(errorMessage: string, tabID: string) {
        this.dispatcher.sendErrorMessage(
            new ErrorMessage(CodeWhispererConstants.genericErrorMessage, errorMessage, tabID)
        )
    }

    public sendScanResults(
        tabID: string,
        scope: CodeWhispererConstants.CodeAnalysisScope,
        fileName?: string,
        canBeVoted?: boolean
    ) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: scanProgressMessage(
                        SecurityScanStep.PROCESS_SCAN_RESULTS + 1,
                        scope,
                        fileName ? path.basename(fileName) : undefined
                    ),
                    messageType: 'answer-part',
                    messageId: ScanNamedMessages.SCAN_SUBMISSION_STATUS_MESSAGE,
                    canBeVoted: canBeVoted,
                },
                tabID
            )
        )
    }

    public sendErrorResponse(error: UnrecoverableErrorType | SecurityScanError, tabID: string) {
        let message = DefaultCodeScanErrorMessage
        const buttons: ChatItemButton[] = []
        if (typeof error === 'string') {
            switch (error) {
                case 'no-project-found': {
                    // TODO: If required we can add "Open the Projects" button in the chat panel.
                    message = CodeWhispererConstants.noOpenProjectsFound
                    break
                }
                case 'no-open-file-found': {
                    message = CodeWhispererConstants.noOpenFileFound
                    break
                }
                case 'invalid-file-type': {
                    message = CodeWhispererConstants.invalidFileTypeChatMessage
                    break
                }
            }
        } else if (error.code === 'NoActiveFileError') {
            message = CodeWhispererConstants.noOpenFileFound
        } else if (error.code === 'ContentLengthError') {
            message = CodeWhispererConstants.ProjectSizeExceededErrorMessage
        } else if (error.code === 'NoSourceFilesError') {
            message = CodeWhispererConstants.noSourceFilesErrorMessage
        } else {
            message = error.customerFacingMessage
        }
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'answer',
                    buttons,
                },
                tabID
            )
        )
    }

    public sendScans(tabID: string, message: string) {
        const followUps: ChatItemAction[] = []
        followUps.push({
            pillText: i18n('AWS.amazonq.scans.projectScan'),
            status: 'info',
            icon: 'folder' as MynahIcons,
            type: ScanAction.RUN_PROJECT_SCAN,
        })
        followUps.push({
            pillText: i18n('AWS.amazonq.scans.fileScan'),
            status: 'info',
            icon: 'file' as MynahIcons,
            type: ScanAction.RUN_FILE_SCAN,
        })
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'ai-prompt',
                    followUps,
                },
                tabID
            )
        )
    }

    // This function shows selected scan type in the chat panel as a user input
    public sendPromptMessage(params: { tabID: string; message: string }) {
        this.dispatcher.sendPromptMessage(new ChatPrompt(params.message, params.tabID))
    }

    public sendCapabilityCard(params: { tabID: string }) {
        this.dispatcher.sendChatMessage(new CapabilityCardMessage(params.tabID))
    }
}
