/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class controls the presentation of the various chat bubbles presented by the
 * Elastic Gumby Transform by Q Experience.
 *
 * As much as possible, all strings used in the experience should originate here.
 */

import { AuthFollowUpType, AuthMessageDataMap } from '../../../../amazonq/auth/model'
import { JDKVersion, TransformationCandidateProject, transformByQState } from '../../../../codewhisperer/models/model'
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
import { ChatItemType } from '../../../../amazonq/commons/model'

export type StaticTextResponseType =
    | 'transform'
    | 'java-home-not-set'
    | 'start-transformation-confirmed'
    | 'job-transmitted'
    | 'end-HIL-early'
    | 'choose-transformation-objective'
    | 'language-upgrade-selected'
    | 'sql-conversion-selected'

export type UnrecoverableErrorType =
    | 'no-project-found'
    | 'no-java-project-found'
    | 'no-maven-java-project-found'
    | 'could-not-compile-project'
    | 'invalid-java-home'
    | 'upload-to-s3-failed'
    | 'job-start-failed'
    | 'unsupported-source-db'
    | 'unsupported-target-db'
    | 'error-parsing-sct-file'
    | 'invalid-zip-no-sct-file'

export enum GumbyNamedMessages {
    COMPILATION_PROGRESS_MESSAGE = 'gumbyProjectCompilationMessage',
    JOB_SUBMISSION_STATUS_MESSAGE = 'gumbyJobSubmissionMessage',
    JOB_SUBMISSION_WITH_DEPENDENCY_STATUS_MESSAGE = 'gumbyJobSubmissionWithDependencyMessage',
    JOB_FAILED_IN_PRE_BUILD = 'gumbyJobFailedInPreBuildMessage',
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

    public sendAuthenticationUpdate(gumbyEnabled: boolean, authenticatingTabIDs: string[]) {
        this.dispatcher.sendAuthenticationUpdate(new AuthenticationUpdateMessage(gumbyEnabled, authenticatingTabIDs))
    }

    public async sendSkipTestsPrompt(tabID: string) {
        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: 'GumbyTransformSkipTestsForm',
            type: 'select',
            title: CodeWhispererConstants.skipUnitTestsFormTitle,
            mandatory: true,
            options: [
                {
                    value: CodeWhispererConstants.runUnitTestsMessage,
                    label: CodeWhispererConstants.runUnitTestsMessage,
                },
                {
                    value: CodeWhispererConstants.skipUnitTestsMessage,
                    label: CodeWhispererConstants.skipUnitTestsMessage,
                },
            ],
        })

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message: CodeWhispererConstants.skipUnitTestsFormMessage,
            })
        )

        this.dispatcher.sendChatPrompt(
            new ChatPrompt(
                {
                    message: 'Q Code Transformation',
                    formItems: formItems,
                },
                'TransformSkipTestsForm',
                tabID,
                false
            )
        )
    }

    public async sendOneOrMultipleDiffsPrompt(tabID: string) {
        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: 'GumbyTransformOneOrMultipleDiffsForm',
            type: 'select',
            title: CodeWhispererConstants.selectiveTransformationFormTitle,
            mandatory: true,
            options: [
                {
                    value: CodeWhispererConstants.oneDiffMessage,
                    label: CodeWhispererConstants.oneDiffMessage,
                },
                {
                    value: CodeWhispererConstants.multipleDiffsMessage,
                    label: CodeWhispererConstants.multipleDiffsMessage,
                },
            ],
        })

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message: CodeWhispererConstants.userPatchDescriptionChatMessage,
            })
        )

        this.dispatcher.sendChatPrompt(
            new ChatPrompt(
                {
                    message: 'Q Code Transformation',
                    formItems: formItems,
                },
                'TransformOneOrMultipleDiffsForm',
                tabID,
                false
            )
        )
    }

    public async sendLanguageUpgradeProjectPrompt(projects: TransformationCandidateProject[], tabID: string) {
        const projectFormOptions: { value: any; label: string }[] = []
        const detectedJavaVersions = new Array<JDKVersion | undefined>()

        for (const candidateProject of projects) {
            projectFormOptions.push({
                value: candidateProject.path,
                label: candidateProject.name,
            })
            detectedJavaVersions.push(candidateProject.JDKVersion)
        }

        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: 'GumbyTransformLanguageUpgradeProjectForm',
            type: 'select',
            title: CodeWhispererConstants.chooseProjectFormTitle,
            mandatory: true,

            options: projectFormOptions,
        })

        formItems.push({
            id: 'GumbyTransformJdkFromForm',
            type: 'select',
            title: CodeWhispererConstants.chooseSourceVersionFormTitle,
            mandatory: true,
            options: [
                {
                    value: JDKVersion.JDK8,
                    label: JDKVersion.JDK8,
                },
                {
                    value: JDKVersion.JDK11,
                    label: JDKVersion.JDK11,
                },
                {
                    value: JDKVersion.JDK17,
                    label: JDKVersion.JDK17,
                },
            ],
        })

        formItems.push({
            id: 'GumbyTransformJdkToForm',
            type: 'select',
            title: CodeWhispererConstants.chooseTargetVersionFormTitle,
            mandatory: true,
            options: [
                {
                    value: JDKVersion.JDK17,
                    label: JDKVersion.JDK17,
                },
            ],
        })

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message: CodeWhispererConstants.projectPromptChatMessage,
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
                'LanguageUpgradeTransformForm',
                tabID,
                false
            )
        )
    }

    public async sendSQLConversionProjectPrompt(projects: TransformationCandidateProject[], tabID: string) {
        const projectFormOptions: { value: any; label: string }[] = []

        for (const candidateProject of projects) {
            projectFormOptions.push({
                value: candidateProject.path,
                label: candidateProject.name,
            })
        }

        const formItems: ChatItemFormItem[] = []
        formItems.push({
            id: 'GumbyTransformSQLConversionProjectForm',
            type: 'select',
            title: CodeWhispererConstants.chooseProjectFormTitle,
            mandatory: true,
            options: projectFormOptions,
        })

        formItems.push({
            id: 'GumbyTransformSQLSchemaForm',
            type: 'select',
            title: CodeWhispererConstants.chooseSchemaFormTitle,
            mandatory: true,
            options: Array.from(transformByQState.getSchemaOptions()).map((schema) => ({
                value: schema,
                label: schema,
            })),
        })

        this.dispatcher.sendAsyncEventProgress(
            new AsyncEventProgressMessage(tabID, {
                inProgress: true,
                message: CodeWhispererConstants.chooseProjectSchemaFormMessage,
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
                'SQLConversionTransformForm',
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

        // don't show these buttons when server build fails
        if (!disableJobActions) {
            buttons.push({
                keepCardAfterClick: true,
                text: CodeWhispererConstants.openTransformationHubButtonText,
                id: ButtonActions.VIEW_TRANSFORMATION_HUB,
                disabled: false, // allow button to be re-clicked
            })

            buttons.push({
                keepCardAfterClick: true,
                text: CodeWhispererConstants.stopTransformationButtonText,
                id: ButtonActions.STOP_TRANSFORMATION_JOB,
                disabled: false,
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

    public sendStaticTextResponse(messageType: StaticTextResponseType, tabID: string) {
        let message = '...'

        switch (messageType) {
            case 'java-home-not-set':
                message = MessengerUtils.createJavaHomePrompt()
                break
            case 'end-HIL-early':
                message = 'I will continue transforming your code without upgrading this dependency.'
                break
            case 'choose-transformation-objective':
                message = CodeWhispererConstants.chooseTransformationObjective
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
                // shown when user has no pom.xml, but at this point also means they have no eligible SQL conversion projects
                message = CodeWhispererConstants.noPomXmlFoundChatMessage
                break
            case 'could-not-compile-project':
                message = CodeWhispererConstants.cleanInstallErrorChatMessage
                break
            case 'invalid-java-home':
                message = CodeWhispererConstants.noJavaHomeFoundChatMessage
                break
            case 'unsupported-source-db':
                message = CodeWhispererConstants.invalidMetadataFileUnsupportedSourceDB
                break
            case 'unsupported-target-db':
                message = CodeWhispererConstants.invalidMetadataFileUnsupportedTargetDB
                break
            case 'error-parsing-sct-file':
                message = CodeWhispererConstants.invalidMetadataFileErrorParsing
                break
            case 'invalid-zip-no-sct-file':
                message = CodeWhispererConstants.invalidMetadataFileNoSctFile
                break
        }

        this.sendJobFinishedMessage(tabID, message)
    }

    /**
     * @description This method renders an error message as a plain message with no other prompt or action
     * for the user to follow. Either the job can continue and this message is purely for
     * informational purposes, or some other error workflow is meant to contribute a
     * follow-up with a user action.
     */
    public sendKnownErrorResponse(tabID: string, message: string) {
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

    public sendJobFinishedMessage(tabID: string, message: string, includeStartNewTransformationButton: boolean = true) {
        const buttons: ChatItemButton[] = []
        if (includeStartNewTransformationButton) {
            buttons.push({
                keepCardAfterClick: false,
                text: CodeWhispererConstants.startTransformationButtonText,
                id: ButtonActions.CONFIRM_START_TRANSFORMATION_FLOW,
                disabled: false,
            })
        }

        if (transformByQState.getSummaryFilePath()) {
            buttons.push({
                keepCardAfterClick: true,
                text: CodeWhispererConstants.viewSummaryButtonText,
                id: ButtonActions.VIEW_SUMMARY,
                disabled: false,
            })
        }

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

    public sendLanguageUpgradeProjectChoiceMessage(
        projectName: string,
        fromJDKVersion: JDKVersion,
        toJDKVersion: JDKVersion,
        tabID: string
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

    public sendSQLConversionProjectSelectionMessage(projectName: string, schema: string, tabID: string) {
        const message = `### Transformation details
-------------
| | |
| :------------------- | -------: |
| **Project**             |   ${projectName}   |
| **Schema** |  ${schema}   |
    `
        this.dispatcher.sendChatMessage(new ChatMessage({ message, messageType: 'prompt' }, tabID))
    }

    public sendSQLConversionMetadataReceivedMessage(tabID: any) {
        const message = `### Transformation details
-------------
| | |
| :------------------- | -------: |
| **Source DB**             |   ${transformByQState.getSourceDB()}   |
| **Target DB** |  ${transformByQState.getTargetDB()}   |
| **Host** |  ${transformByQState.getSourceServerName()}   |
    `
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                { message: CodeWhispererConstants.sqlMetadataFileReceived, messageType: 'ai-prompt' },
                tabID
            )
        )
        this.dispatcher.sendChatMessage(new ChatMessage({ message, messageType: 'ai-prompt' }, tabID))
    }

    public sendSkipTestsSelectionMessage(skipTestsSelection: string, tabID: string) {
        const message = `Okay, I will ${skipTestsSelection.toLowerCase()} when building your project.`
        this.dispatcher.sendChatMessage(new ChatMessage({ message, messageType: 'ai-prompt' }, tabID))
    }

    public sendOneOrMultipleDiffsMessage(selectiveTransformationSelection: string, tabID: string) {
        const message = `Okay, I will create ${selectiveTransformationSelection.toLowerCase()} with my proposed changes.`
        this.dispatcher.sendChatMessage(new ChatMessage({ message, messageType: 'ai-prompt' }, tabID))
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

        for (const version of versions.allVersions) {
            valueFormOptions.push({
                value: version,
                label: version,
            })
        }

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

    public sendViewBuildLog(tabID: string) {
        const message = `I am having trouble building your project in the secure build environment and could not complete the transformation.`
        const messageId = GumbyNamedMessages.JOB_FAILED_IN_PRE_BUILD
        const buttons: ChatItemButton[] = []

        if (transformByQState.getPreBuildLogFilePath() !== '') {
            buttons.push({
                keepCardAfterClick: true,
                text: `View Build Log`,
                id: ButtonActions.OPEN_BUILD_LOG,
            })
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'ai-prompt',
                    messageId,
                    buttons,
                },
                tabID
            )
        )
    }

    public async sendSelectSQLMetadataFileMessage(tabID: string) {
        const message = CodeWhispererConstants.selectSQLMetadataFileHelpMessage
        const buttons: ChatItemButton[] = []

        buttons.push({
            keepCardAfterClick: true,
            text: 'Select metadata file',
            id: ButtonActions.SELECT_SQL_CONVERSION_METADATA_FILE,
        })

        buttons.push({
            keepCardAfterClick: false,
            text: 'Cancel',
            id: ButtonActions.CANCEL_TRANSFORMATION_FORM,
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
}
