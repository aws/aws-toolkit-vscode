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
import DependencyVersions from '../../../models/dependencies'

export type StaticTextResponseType =
    | 'transform'
    | 'java-home-not-set'
    | 'start-transformation-confirmed'
    | 'job-transmitted'
    | 'end-HIL-early'

export type UnrecoverableErrorType =
    | 'no-project-found'
    | 'no-java-project-found'
    | 'no-maven-java-project-found'
    | 'could-not-compile-project'
    | 'invalid-java-home'
    | 'unsupported-source-jdk-version'
    | 'upload-to-s3-failed'
    | 'job-start-failed'

export type ErrorResponseType = 'no-alternate-dependencies-found'

export enum GumbyNamedMessages {
    COMPILATION_PROGRESS_MESSAGE = 'gumbyProjectCompilationMessage',
    JOB_SUBMISSION_STATUS_MESSAGE = 'gumbyJobSubmissionMessage',
    JOB_SUBMISSION_WITH_DEPENDENCY_STATUS_MESSAGE = 'gumbyJobSubmissionWithDependencyMessage',
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

    public sendJobSubmittedMessage(
        tabID: string,
        disableJobActions: boolean = false,
        message: string = CodeWhispererConstants.jobStartedChatMessage,
        messageID: string = GumbyNamedMessages.JOB_SUBMISSION_STATUS_MESSAGE
    ) {
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
                messageId: messageID,
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
            case 'end-HIL-early':
                message = `I will continue transforming your code without upgrading this dependency.`
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

    /**
     * This method renders an error message with a button at the end that will try the
     * transformation again from the beginning. This message is meant for errors that are
     * completely unrecoverable: the job cannot be completed in its current state,
     * and the flow must be tried again.
     */
    public sendUnrecoverableErrorResponse(type: UnrecoverableErrorType, tabID: string) {
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
                break
            case 'upload-to-s3-failed':
                message = `I was not able to upload your module to be transformed. Please try again later.`
                break
            case 'job-start-failed':
                message = CodeWhispererConstants.failedToStartJobTooManyJobsChatMessage
                break
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

    /**
     * @description This method renders an error message as a plain message with no other prompt or action
     * for the user to follow. Either the job can continue and this message is purely for
     * informational purposes, or some other error workflow is meant to contribute a
     * follow-up with a user action.
     */
    public sendKnownErrorResponse(type: ErrorResponseType, tabID: string) {
        let message = '...'

        switch (type) {
            case 'no-alternate-dependencies-found':
                message = `I could not find any other versions of this dependency in your local Maven repository. Try transforming the dependency to make it compatible with Java 17, and then try transforming this module again.`
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

    public sendCommandMessage(message: any) {
        this.dispatcher.sendCommandMessage(new SendCommandMessage(message.command, message.tabID, message.eventId))
    }

    public sendJobFinishedMessage(tabID: string, message: string) {
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

    public sendHumanInTheLoopInitialMessage(tabID: string, codeSnippet: string) {
        let message = `I was not able to upgrade all dependencies. To resolve it, I will try to find an updated depedency in your local Maven repository. I will need additional information from you to continue.`

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'ai-prompt',
                },
                tabID
            )
        )

        if (codeSnippet !== '') {
            message = `Here is the dependency causing the issue: 
\`\`\`
${codeSnippet}
\`\`\`
`

            const buttons: ChatItemButton[] = []
            buttons.push({
                keepCardAfterClick: true,
                text: 'Open File',
                id: ButtonActions.OPEN_FILE,
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

        message = `I am searching for other dependency versions available in your Maven repository...`

        this.sendInProgressMessage(tabID, message)
    }

    public sendInProgressMessage(tabID: string, message: string, messageName?: string) {
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

    public sendDependencyVersionsFoundMessage(versions: DependencyVersions, tabID: string) {
        const message = MessengerUtils.createAvailableDependencyVersionString(versions)

        const valueFormOptions: { value: any; label: string }[] = []

        versions.allVersions.forEach(version => {
            valueFormOptions.push({
                value: version,
                label: version,
            })
        })

        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: 'GumbyTransformDependencyForm',
            type: 'select',
            title: 'Choose which version I should use:',
            mandatory: true,

            options: valueFormOptions,
        })

        this.dispatcher.sendChatPrompt(
            new ChatPrompt(
                {
                    message,
                    formItems: formItems,
                },
                'TransformDependencyForm',
                tabID,
                false
            )
        )
    }

    public sendHILContinueMessage(tabID: string, selectedDependencyVersion: string) {
        let message = `### Dependency Details
-------------
| | |
| :------------------- | -------: |
| **Dependency Version**             |   ${selectedDependencyVersion}   |
`

        this.dispatcher.sendChatMessage(new ChatMessage({ message, messageType: 'prompt' }, tabID))

        message = `I received your target version dependency.`
        this.sendInProgressMessage(tabID, message)
    }

    public sendHILResumeMessage(tabID: string) {
        const message = `I will continue transforming your code. You can monitor progress in the Transformation Hub.`
        this.sendAsyncEventProgress(
            tabID,
            true,
            undefined,
            GumbyNamedMessages.JOB_SUBMISSION_WITH_DEPENDENCY_STATUS_MESSAGE
        )
        this.sendJobSubmittedMessage(
            tabID,
            false,
            message,
            GumbyNamedMessages.JOB_SUBMISSION_WITH_DEPENDENCY_STATUS_MESSAGE
        )
    }
}
