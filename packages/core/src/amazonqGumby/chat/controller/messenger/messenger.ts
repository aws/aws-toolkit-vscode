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
} from '../../views/connector/connector'
import { ChatItemButton, ChatItemFormItem } from '@aws/mynah-ui/dist/static'
import { ButtonActions, GumbyCommands } from './messengerUtils'
import { TransformationCandidateProject } from '../../../../codewhisperer/service/transformByQHandler'

export type StaticTextResponseType =
    | 'no-project-found'
    | 'transform'
    | 'start-transformation-confirmed'
    | 'job-transmitted'
    | 'no-workspace-open'
    | 'no-java-project-found'
    | 'no-maven-java-project-found'
    | 'could-not-compile-project'
export type LoadingTextResponseType = 'start-compilation' | 'compile-succeeded' | 'job-submitted'

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
                value: jdkVersion.toString(),
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
            new AsyncEventProgressMessage(
                tabID,
                true,
                `I can upgrade your Java ${jdkFormOptions[0].label} project. To start the transformation, I need some information from you. Choose the module you want to upgrade and the target code version to upgrade to, and then choose Transform. It can take 10-30 minutes to upgrade your code, depending on the size of your module.`
            )
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

    /**
     * This method is used to generate a chat bubble with a 'loading bar' surrounding it,
     * signalling something going on in the background (validation, compilation, etc.)
     * @param type
     * @param tabID
     */
    public sendUpdatePreviousAnswer(type: LoadingTextResponseType, tabID: string) {
        let updatedMessage = ''
        switch (type) {
            case 'start-compilation': {
                updatedMessage = 'Compiling the module and checking dependencies...'
                break
            }
            case 'compile-succeeded': {
                updatedMessage = 'Local project build and dependency check passed.'
                break
            }
            default: {
                updatedMessage = '...'
                break
            }
        }
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, true, updatedMessage))
    }

    public sendAsyncEventProgress(
        tabID: string,
        inProgress: boolean,
        message: string | undefined = undefined,
        messageID: string | undefined = undefined
    ) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, inProgress, message, messageID))
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
                keepCardAfterClick: false,
                text: 'Open Transformation Hub',
                id: ButtonActions.VIEW_TRANSFORMATION_HUB,
            })

            buttons.push({
                keepCardAfterClick: false,
                text: 'Stop Transformation',
                id: ButtonActions.STOP_TRANSFORMATION_JOB,
            })
        }

        const jobSubmittedMessage = new ChatMessage(
            {
                message,
                messageType: 'answer-part',
                messageId: 'gumbyJobSubmittedMessage',
                buttons,
            },
            tabID
        )

        this.dispatcher.sendChatMessage(jobSubmittedMessage)
    }

    public sendStaticTextResponse(type: StaticTextResponseType, tabID: string) {
        let message = '...'

        switch (type) {
            case 'no-workspace-open':
                message = 'To begin, please open a workspace.'
                break
            case 'no-project-found':
            case 'no-java-project-found':
                message =
                    'None of your open projects are supported by Amazon Q Code Transformation. Currently, Amazon Q can only upgrade Java projects built on Maven. \n For more information, see the Amazon Q documentation.'
                break
            case 'no-maven-java-project-found':
                message =
                    'None of your open Java projects are supported by Amazon Q Code Transformation. Currently, Amazon Q can only upgrade Java projects built on Maven. A pom.xml must be present in the root of your project to upgrade it. \n For more information, see the Amazon Q documentation.'
                break
            case 'could-not-compile-project':
                message = `Amazon Q couldn't execute the Maven install or Maven copy-dependencies commands. To troubleshoot, see the [Amazon Q documentation.](https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/troubleshooting-code-transformation.html#maven-commands-failing)`
                break
            case 'job-transmitted':
                message =
                    "I'm starting to transform your code. It can take 10 to 60 minutes to upgrade your code, depending on the size of your module. To monitor progress, go to the Transformation Hub."
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

    public sendCommandMessage(message: { command: GumbyCommands }) {
        console.log(`messenger sendcommandMessenger: ${message.command}`)
        this.dispatcher.sendCommandMessage(new SendCommandMessage(message.command))
    }

    public sendJobFinishedMessage(tabID: string, cancelled: boolean = false, jobStatus: string = '') {
        let message =
            'I cancelled your transformation. If you want to start another transformation, choose **Start a new transformation.**'

        if (!cancelled) {
            message = 'The transformation job has been completed.'
        }

        const buttons: ChatItemButton[] = []
        buttons.push({
            keepCardAfterClick: false,
            text: 'Start a new transformation',
            id: ButtonActions.CONFIRM_START_TRANSFORMATION_FLOW,
        })

        const jobFinishedMessage = new ChatMessage(
            {
                message,
                messageType: 'ai-prompt',
                buttons,
            },
            tabID
        )

        this.dispatcher.sendChatMessage(jobFinishedMessage)
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

        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, true, ''))

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(
                tabID,
                true,
                "I'm checking for open projects that are eligible for Code Transformation."
            )
        )
    }
}
