/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class controls the presentation of the various chat bubbles presented by the
 * Elastic Gumby Transform by Q Experience.
 *
 * As much as possible, all strings used in the experience should originate here.
 */

import { AuthFollowUpType, expiredText, enableQText, reauthenticateText } from '../../../../amazonq/auth/model'
import { ChatItemType } from '../../../../amazonqFeatureDev/models'
import { JDKVersion, TransformationCandidateProject } from '../../../../codewhisperer/models/model'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'
import {
    AppToWebViewMessageDispatcher,
    AsyncEventProgressMessage,
    AuthNeededException,
    AuthenticationUpdateMessage,
    ChatInputEnabledMessage,
    ChatMessage,
    ChatPrompt,
    ErrorMessage,
    SendCommandMessage,
    UpdatePlaceholderMessage,
} from '../../views/connector/connector'
import { ChatItemButton, ChatItemFormItem } from '@aws/mynah-ui/dist/static'
import MessengerUtils, { ButtonActions } from './messengerUtils'

export type StaticTextResponseType =
    | 'transform'
    | 'java-home-not-set'
    | 'start-transformation-confirmed'
    | 'job-transmitted'

export type ErrorTextResponseType =
    | 'no-project-found'
    | 'no-java-project-found'
    | 'no-maven-java-project-found'
    | 'could-not-compile-project'
    | 'invalid-java-home'
    | 'unsupported-source-jdk-version'

export enum GumbyNamedMessages {
    COMPILATION_PROGRESS_MESSAGE = 'gumbyProjectCompilationMessage',
    JOB_SUBMISSION_STATUS_MESSAGE = 'gumbyJobSubmissionMessage',
}

export class Messenger {
    public constructor(private readonly dispatcher: AppToWebViewMessageDispatcher) {}

    public sendAnswer(params: { message?: string; type: ChatItemType; tabID: string; messageID?: string }) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: params.message,
                    messageType: params.type,
                    messageId: params.messageID,
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

    public sendChatInputEnabled(tabID: string, enabled: boolean) {
        this.dispatcher.sendChatInputEnabled(new ChatInputEnabledMessage(tabID, enabled))
    }

    public sendUpdatePlaceholder(tabID: string, newPlaceholder: string) {
        this.dispatcher.sendUpdatePlaceholder(new UpdatePlaceholderMessage(tabID, newPlaceholder))
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

    public sendAuthenticationUpdate(gumbyEnabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(new AuthenticationUpdateMessage(gumbyEnabled, authenticatingTabIDs))
    }

    public async sendProjectPrompt(projects: TransformationCandidateProject[], tabID: string) {
        const projectFormOptions: { value: any; label: string }[] = []
        const detectedJavaVersions = new Array<JDKVersion | undefined>()

        projects.forEach(candidateProject => {
            projectFormOptions.push({
                value: candidateProject.path,
                label: candidateProject.name,
            })
            detectedJavaVersions.push(candidateProject.JDKVersion)
        })

        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: 'GumbyTransformProjectForm',
            type: 'select',
            title: 'Choose a project to transform',
            mandatory: true,

            options: projectFormOptions,
        })

        formItems.push({
            id: 'GumbyTransformJdkFromForm',
            type: 'select',
            title: 'Choose the source code version',
            mandatory: true,
            options: [
                {
                    value: JDKVersion.JDK8,
                    label: JDKVersion.JDK8.toString(),
                },
                {
                    value: JDKVersion.JDK11,
                    label: JDKVersion.JDK11.toString(),
                },
                {
                    value: JDKVersion.UNSUPPORTED,
                    label: 'Other',
                },
            ],
        })

        formItems.push({
            id: 'GumbyTransformJdkToForm',
            type: 'select',
            title: 'Choose the target code version',
            mandatory: true,
            options: [
                {
                    value: JDKVersion.JDK17.toString(),
                    label: JDKVersion.JDK17.toString(),
                },
            ],
        })

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message: MessengerUtils.createTransformationConfirmationPrompt(detectedJavaVersions),
            })
        )

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: false,
                message: undefined,
            })
        )

        this.dispatcher.sendChatPrompt(
            new ChatPrompt(
                {
                    message: 'Q Code Transformation',
                    formItems: formItems,
                },
                'TransformForm',
                tabID,
                false
            )
        )
    }

    public sendAsyncEventProgress(
        tabID: string,
        inProgress: boolean,
        message: string | undefined = undefined,
        messageId: string | undefined = undefined
    ) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, { inProgress, message, messageId }))
    }

    public sendCompilationInProgress(tabID: string) {
        const message = CodeWhispererConstants.buildStartedChatMessage

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, { inProgress: true, message: undefined })
        )

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message,
            })
        )
    }

    public sendCompilationFinished(tabID: string) {
        const message = CodeWhispererConstants.buildSucceededChatMessage

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message,
            })
        )
    }

    public sendJobSubmittedMessage(tabID: string, disableJobActions: boolean = false) {
        const message = CodeWhispererConstants.jobStartedChatMessage

        const buttons: ChatItemButton[] = []

        if (!disableJobActions) {
            // Note: buttons can only be clicked once.
            // To get around this, we remove the card after it's clicked and then resubmit the message.
            buttons.push({
                keepCardAfterClick: true,
                text: CodeWhispererConstants.openTransformationHubButtonText,
                id: ButtonActions.VIEW_TRANSFORMATION_HUB,
            })

            buttons.push({
                keepCardAfterClick: true,
                text: CodeWhispererConstants.stopTransformationButtonText,
                id: ButtonActions.STOP_TRANSFORMATION_JOB,
            })
        }

        const jobSubmittedMessage = new ChatMessage(
            {
                message,
                messageType: 'ai-prompt',
                messageId: GumbyNamedMessages.JOB_SUBMISSION_STATUS_MESSAGE,
                buttons,
            },
            tabID
        )

        this.dispatcher.sendChatMessage(jobSubmittedMessage)
    }

    public sendUserPrompt(prompt: string, tabID: string) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: prompt,
                    messageType: 'prompt',
                },
                tabID
            )
        )
    }

    public sendStaticTextResponse(type: StaticTextResponseType, tabID: string) {
        let message = '...'

        switch (type) {
            case 'java-home-not-set':
                message = MessengerUtils.createJavaHomePrompt()
                break
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'ai-prompt',
                },
                tabID
            )
        )
    }

    public sendRetryableErrorResponse(type: ErrorTextResponseType, tabID: string) {
        let message = '...'

        switch (type) {
            case 'no-project-found':
                message = CodeWhispererConstants.noOpenProjectsFoundChatMessage
                break
            case 'no-java-project-found':
                message = CodeWhispererConstants.noJavaProjectsFoundChatMessage
                break
            case 'no-maven-java-project-found':
                message = CodeWhispererConstants.noPomXmlFoundChatMessage
                break
            case 'could-not-compile-project':
                message = CodeWhispererConstants.cleanInstallErrorChatMessage
                break
            case 'invalid-java-home':
                message = CodeWhispererConstants.noJavaHomeFoundChatMessage
                break
            case 'unsupported-source-jdk-version':
                message = CodeWhispererConstants.unsupportedJavaVersionChatMessage
        }

        const buttons: ChatItemButton[] = []
        buttons.push({
            keepCardAfterClick: false,
            text: CodeWhispererConstants.startTransformationButtonText,
            id: ButtonActions.CONFIRM_START_TRANSFORMATION_FLOW,
        })

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'ai-prompt',
                    buttons,
                },
                tabID
            )
        )
    }

    public sendCommandMessage(message: any) {
        this.dispatcher.sendCommandMessage(new SendCommandMessage(message.command, message.tabId, message.eventId))
    }

    public sendJobFinishedMessage(tabID: string, message: string = '') {
        const buttons: ChatItemButton[] = []
        buttons.push({
            keepCardAfterClick: false,
            text: CodeWhispererConstants.startTransformationButtonText,
            id: ButtonActions.CONFIRM_START_TRANSFORMATION_FLOW,
        })

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'ai-prompt',
                    buttons,
                },
                tabID
            )
        )
    }

    public sendTransformationIntroduction(tabID: string) {
        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, { inProgress: true, message: undefined })
        )

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message: CodeWhispererConstants.checkingForProjectsChatMessage,
            })
        )
    }

    public sendProjectSelectionMessage(
        projectName: string,
        fromJDKVersion: JDKVersion,
        toJDKVersion: JDKVersion,
        tabID: any
    ) {
        const message = `### Transformation details
-------------
| | |
| :------------------- | -------: |
| **Project**             |   ${projectName}   |
| **Source JDK version** |  ${fromJDKVersion}   |
| **Target JDK version** |  ${toJDKVersion}   |
    `

        this.dispatcher.sendChatMessage(new ChatMessage({ message, messageType: 'prompt' }, tabID))
    }
}
