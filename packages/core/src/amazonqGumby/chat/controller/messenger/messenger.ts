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
import { JDKVersion } from '../../../../codewhisperer/models/model'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
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
import { TransformationCandidateProject } from '../../../../codewhisperer/service/transformByQHandler'

export type StaticTextResponseType =
    | 'no-project-found'
    | 'transform'
    | 'java-home-not-set'
    | 'start-transformation-confirmed'
    | 'job-transmitted'
    | 'no-workspace-open'
    | 'no-java-project-found'
    | 'no-maven-java-project-found'
    | 'could-not-compile-project'

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
            new ErrorMessage(`Sorry, we encountered a problem when processing your request.`, errorMessage, tabID)
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

    public async sendProjectPrompt(modules: TransformationCandidateProject[], tabID: string) {
        const moduleFormOptions: { value: string; label: string }[] = []
        const uniqueJavaOptions = new Set<JDKVersion>()

        modules.forEach(candidateModule => {
            moduleFormOptions.push({
                value: candidateModule.path,
                label: candidateModule.name,
            })

            if (candidateModule.JDKVersion !== undefined) {
                uniqueJavaOptions.add(candidateModule.JDKVersion)
            }
        })

        const jdkFormOptions: { value: string; label: string }[] = []
        uniqueJavaOptions.forEach(jdkVersion => {
            jdkFormOptions.push({
                value: jdkVersion,
                label: jdkVersion.toString(),
            })
        })

        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: 'GumbyTransformModuleForm',
            type: 'select',
            title: 'Choose a module to transform',
            mandatory: true,
            options: moduleFormOptions,
        })

        formItems.push({
            id: 'GumbyTransformJdkFromForm',
            type: 'select',
            title: 'Choose the source code version',
            mandatory: true,
            options: jdkFormOptions,
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
                message: `I can upgrade your Java ${jdkFormOptions[0].label} project. To start the transformation, I need some information from you. Choose the module you want to upgrade and the target code version to upgrade to, and then choose Transform. It can take 10-30 minutes to upgrade your code, depending on the size of your module.`,
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
                `TransformForm`,
                tabID
            )
        )
    }

    sendTextInputPrompt(prompt: string, formID: string, tabID: string) {
        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: `${formID}Input`,
            type: 'textinput',
            mandatory: true,
        })

        this.dispatcher.sendChatPrompt(
            new ChatPrompt(
                {
                    message: prompt,
                    formItems: formItems,
                },
                formID,
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
        const message = 'Compiling the module and checking dependencies...'

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
        const message = 'Local project build and dependency check passed.'

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: false,
                message,
            })
        )
    }

    public sendJobSubmittedMessage(tabID: string, disableJobActions: boolean = false) {
        const message =
            'Your job has been submitted for transformation. The code transformation process may take 10-30 mins depending on the size of your module. You can view the details in the transformation hub.'

        const buttons: ChatItemButton[] = []

        if (!disableJobActions) {
            // Note: buttons can only be clicked once.
            // To get around this, we remove the card after they're clicked and then
            // resubmit the message.
            buttons.push({
                keepCardAfterClick: true,
                text: 'Open Transformation Hub',
                id: ButtonActions.VIEW_TRANSFORMATION_HUB,
            })

            buttons.push({
                keepCardAfterClick: true,
                text: 'Stop Transformation',
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
            case 'no-workspace-open':
                message = 'To begin, please open a workspace.'
                break
            case 'java-home-not-set':
                message = MessengerUtils.createJavaHomePrompt()
                break
            case 'no-project-found':
            case 'no-java-project-found':
                message = `None of your open projects are supported by Amazon Q Code Transformation. Currently, Amazon Q can only upgrade Java projects built on Maven.

For more information, see the Amazon Q documentation.`
                break
            case 'no-maven-java-project-found':
                message = `None of your open Java projects are supported by Amazon Q Code Transformation. Currently, Amazon Q can only upgrade Java projects built on Maven. A pom.xml must be present in the root of your project to upgrade it.
                    
For more information, see the Amazon Q documentation.`
                break
            case 'could-not-compile-project':
                message = `Amazon Q couldn't execute the Maven install or Maven copy-dependencies commands. 
                
To troubleshoot, see the [Amazon Q documentation.](https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/troubleshooting-code-transformation.html#maven-commands-failing)`
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
        this.dispatcher.sendCommandMessage(new SendCommandMessage(message.command, message.tabId, message.eventId))
    }

    public sendJobFinishedMessage(tabID: string, cancelled: boolean = false, jobStatus: string = '') {
        let message =
            'I cancelled your transformation. If you want to start another transformation, choose **Start a new transformation.**'

        if (!cancelled) {
            message =
                'The transformation job has been completed. If you want to start another transformation, choose **Start a new transformation.**'
        }

        const buttons: ChatItemButton[] = []
        buttons.push({
            keepCardAfterClick: false,
            text: 'Start a new transformation',
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
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: '/transform',
                    messageType: 'prompt',
                },
                tabID
            )
        )

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, { inProgress: true, message: undefined })
        )

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message: "I'm checking for open projects that are eligible for Code Transformation.",
            })
        )
    }
}
