/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for responding to UI events by calling
 * the Gumby extension.
 */
import nodefs from 'fs' // eslint-disable-line no-restricted-imports
import path from 'path'
import * as vscode from 'vscode'
import { GumbyNamedMessages, Messenger } from './messenger/messenger'
import { AuthController } from '../../../amazonq/auth/controller'
import { ChatSessionManager } from '../storages/chatSession'
import { ConversationState, Session } from '../session/session'
import { getLogger } from '../../../shared/logger'
import { featureName } from '../../models/constants'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import {
    cleanupTransformationJob,
    compileProject,
    finishHumanInTheLoop,
    getValidLanguageUpgradeCandidateProjects,
    openBuildLogFile,
    openHilPomFile,
    parseBuildFile,
    postTransformationJob,
    processLanguageUpgradeTransformFormInput,
    processSQLConversionTransformFormInput,
    startTransformByQ,
    stopTransformByQ,
    validateCanCompileProject,
    setMaven,
    getValidSQLConversionCandidateProjects,
    validateSQLMetadataFile,
} from '../../../codewhisperer/commands/startTransformByQ'
import { JDKVersion, TransformationCandidateProject, transformByQState } from '../../../codewhisperer/models/model'
import {
    AbsolutePathDetectedError,
    AlternateDependencyVersionsNotFoundError,
    JavaHomeNotSetError,
    JobStartError,
    ModuleUploadError,
    NoJavaProjectsFoundError,
    NoMavenJavaProjectsFoundError,
    NoOpenProjectsError,
    TransformationPreBuildError,
} from '../../errors'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import MessengerUtils, { ButtonActions, GumbyCommands } from './messenger/messengerUtils'
import { CancelActionPositions, JDKToTelemetryValue, telemetryUndefined } from '../../telemetry/codeTransformTelemetry'
import { openUrl } from '../../../shared/utilities/vsCodeUtils'
import {
    telemetry,
    CodeTransformJavaTargetVersionsAllowed,
    CodeTransformJavaSourceVersionsAllowed,
} from '../../../shared/telemetry/telemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import { CodeTransformTelemetryState } from '../../telemetry/codeTransformTelemetryState'
import DependencyVersions from '../../models/dependencies'
import { getStringHash } from '../../../shared/utilities/textUtilities'
import { getVersionData } from '../../../codewhisperer/service/transformByQ/transformMavenHandler'
import AdmZip from 'adm-zip'
import { AuthError } from '../../../auth/sso/server'
import { getAuthType } from '../../../auth/utils'

// These events can be interactions within the chat,
// or elsewhere in the IDE
export interface ChatControllerEventEmitters {
    readonly transformSelected: vscode.EventEmitter<any>
    readonly tabOpened: vscode.EventEmitter<any>
    readonly tabClosed: vscode.EventEmitter<any>
    readonly authClicked: vscode.EventEmitter<any>
    readonly formActionClicked: vscode.EventEmitter<any>
    readonly commandSentFromIDE: vscode.EventEmitter<any>
    readonly transformationFinished: vscode.EventEmitter<any>
    readonly processHumanChatMessage: vscode.EventEmitter<any>
    readonly linkClicked: vscode.EventEmitter<any>
    readonly humanInTheLoopStartIntervention: vscode.EventEmitter<any>
    readonly humanInTheLoopPromptUserForDependency: vscode.EventEmitter<any>
    readonly humanInTheLoopSelectionUploaded: vscode.EventEmitter<any>
    readonly errorThrown: vscode.EventEmitter<any>
}

export class GumbyController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionManager
    private authController: AuthController

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: Messenger,
        onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.messenger = messenger
        this.sessionStorage = ChatSessionManager.Instance
        this.authController = new AuthController()

        this.chatControllerMessageListeners.transformSelected.event((data) => {
            return this.transformInitiated(data)
        })

        this.chatControllerMessageListeners.tabOpened.event((data) => {
            return this.tabOpened(data)
        })

        this.chatControllerMessageListeners.tabClosed.event((data) => {
            return this.tabClosed(data)
        })

        this.chatControllerMessageListeners.authClicked.event((data) => {
            this.authClicked(data)
        })

        this.chatControllerMessageListeners.commandSentFromIDE.event((data) => {
            return this.commandSentFromIDE(data)
        })

        this.chatControllerMessageListeners.formActionClicked.event((data) => {
            return this.formActionClicked(data)
        })

        this.chatControllerMessageListeners.transformationFinished.event((data) => {
            return this.transformationFinished(data)
        })

        this.chatControllerMessageListeners.processHumanChatMessage.event((data) => {
            return this.processHumanChatMessage(data)
        })

        this.chatControllerMessageListeners.linkClicked.event((data) => {
            this.openLink(data)
        })

        this.chatControllerMessageListeners.humanInTheLoopStartIntervention.event((data) => {
            return this.startHILIntervention(data)
        })

        this.chatControllerMessageListeners.humanInTheLoopPromptUserForDependency.event((data) => {
            return this.HILPromptForDependency(data)
        })

        this.chatControllerMessageListeners.humanInTheLoopSelectionUploaded.event((data) => {
            return this.HILDependencySelectionUploaded(data)
        })

        this.chatControllerMessageListeners.errorThrown.event((data) => {
            return this.handleError(data)
        })
    }

    private async tabOpened(message: any) {
        const session: Session = this.sessionStorage.getSession()
        const tabID = this.sessionStorage.setActiveTab(message.tabID)

        // check if authentication has expired
        try {
            getLogger().debug(`${featureName}: Session created with id: ${session.tabID}`)

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, tabID)
                session.isAuthenticating = true
                return
            }
        } catch (err: any) {
            this.messenger.sendErrorMessage(err.message, message.tabID)
        }
    }

    private async tabClosed(data: any) {
        this.sessionStorage.removeActiveTab()
    }

    private authClicked(message: any) {
        this.authController.handleAuth(message.authType)

        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: 'Follow instructions to re-authenticate ...',
        })

        // Explicitly ensure the user goes through the re-authenticate flow
        this.messenger.sendChatInputEnabled(message.tabID, false)
    }

    private commandSentFromIDE(data: any): any {
        this.messenger.sendCommandMessage(data)
    }

    private async transformInitiated(message: any) {
        // silently check for projects eligible for SQL conversion
        let embeddedSQLProjects: TransformationCandidateProject[] = []
        try {
            embeddedSQLProjects = await getValidSQLConversionCandidateProjects()
        } catch (err) {
            getLogger().error(`CodeTransformation: error validating SQL conversion projects: ${err}`)
        }

        if (embeddedSQLProjects.length === 0) {
            await this.handleLanguageUpgrade(message)
            return
        }

        let javaUpgradeProjects: TransformationCandidateProject[] = []
        try {
            javaUpgradeProjects = await getValidLanguageUpgradeCandidateProjects()
        } catch (err) {
            getLogger().error(`CodeTransformation: error validating Java upgrade projects: ${err}`)
        }

        if (javaUpgradeProjects.length === 0) {
            await this.handleSQLConversion(message)
            return
        }

        // if previous transformation was already running, show correct message to user
        switch (this.sessionStorage.getSession().conversationState) {
            case ConversationState.JOB_SUBMITTED:
                this.messenger.sendAsyncEventProgress(
                    message.tabID,
                    true,
                    undefined,
                    GumbyNamedMessages.JOB_SUBMISSION_STATUS_MESSAGE
                )
                this.messenger.sendJobSubmittedMessage(message.tabID)
                return
            case ConversationState.COMPILING:
                this.messenger.sendAsyncEventProgress(
                    message.tabID,
                    true,
                    undefined,
                    GumbyNamedMessages.COMPILATION_PROGRESS_MESSAGE
                )
                this.messenger.sendCompilationInProgress(message.tabID)
                return
        }

        // Start /transform chat flow
        CodeTransformTelemetryState.instance.setSessionId()

        this.sessionStorage.getSession().conversationState = ConversationState.WAITING_FOR_TRANSFORMATION_OBJECTIVE
        this.messenger.sendStaticTextResponse('choose-transformation-objective', message.tabID)
        this.messenger.sendChatInputEnabled(message.tabID, true)
        this.messenger.sendUpdatePlaceholder(
            message.tabID,
            CodeWhispererConstants.chooseTransformationObjectivePlaceholder
        )
    }

    private async beginTransformation(message: any) {
        await telemetry.codeTransform_initiateTransform.run(async () => {
            const authType = await getAuthType()
            telemetry.record({
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                credentialSourceId: authType,
            })

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                this.sessionStorage.getSession().isAuthenticating = true
                await this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                throw new AuthError('Not connected to Amazon Q', `AuthState=${authState.amazonQ}`)
            }
            this.messenger.sendTransformationIntroduction(message.tabID)
        })
    }

    private async handleLanguageUpgrade(message: any) {
        try {
            await this.beginTransformation(message)
            const validProjects = await this.validateLanguageUpgradeProjects(message)
            if (validProjects.length > 0) {
                this.sessionStorage.getSession().updateCandidateProjects(validProjects)
                await this.messenger.sendLanguageUpgradeProjectPrompt(validProjects, message.tabID)
            }
        } catch (err: any) {
            getLogger().error(`Error handling language upgrade: ${err}`)
        }
    }

    private async handleSQLConversion(message: any) {
        try {
            await this.beginTransformation(message)
            const validProjects = await this.validateSQLConversionProjects(message)
            if (validProjects.length > 0) {
                this.sessionStorage.getSession().updateCandidateProjects(validProjects)
                await this.messenger.sendSelectSQLMetadataFileMessage(message.tabID)
            }
        } catch (err: any) {
            getLogger().error(`Error handling SQL conversion: ${err}`)
        }
    }

    private async validateLanguageUpgradeProjects(message: any) {
        let telemetryJavaVersion = JDKToTelemetryValue(JDKVersion.UNSUPPORTED) as CodeTransformJavaSourceVersionsAllowed
        try {
            const validProjects = await telemetry.codeTransform_validateProject.run(async () => {
                telemetry.record({
                    codeTransformBuildSystem: 'Maven', // default for Maven until we add undefined field to CodeTransformBuildSystem
                    codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                })

                const validProjects = await getValidLanguageUpgradeCandidateProjects()
                if (validProjects.length > 0) {
                    // validProjects[0].JDKVersion will be undefined if javap errors out or no .class files found, so call it UNSUPPORTED
                    const javaVersion = validProjects[0].JDKVersion ?? JDKVersion.UNSUPPORTED
                    telemetryJavaVersion = JDKToTelemetryValue(javaVersion) as CodeTransformJavaSourceVersionsAllowed
                }
                telemetry.record({ codeTransformLocalJavaVersion: telemetryJavaVersion })

                await setMaven()
                const versionInfo = await getVersionData()
                const mavenVersionInfoMessage = `${versionInfo[0]} (${transformByQState.getMavenName()})`
                telemetry.record({ buildSystemVersion: mavenVersionInfoMessage })

                return validProjects
            })
            return validProjects
        } catch (e: any) {
            if (e instanceof NoJavaProjectsFoundError) {
                this.messenger.sendUnrecoverableErrorResponse('no-java-project-found', message.tabID)
            } else if (e instanceof NoMavenJavaProjectsFoundError) {
                this.messenger.sendUnrecoverableErrorResponse('no-maven-java-project-found', message.tabID)
            } else if (e instanceof NoOpenProjectsError) {
                this.messenger.sendUnrecoverableErrorResponse('no-project-found', message.tabID)
            }
        }
        return []
    }

    private async validateSQLConversionProjects(message: any) {
        try {
            const validProjects = await getValidSQLConversionCandidateProjects()
            return validProjects
        } catch (e: any) {
            if (e instanceof NoJavaProjectsFoundError) {
                this.messenger.sendUnrecoverableErrorResponse('no-java-project-found', message.tabID)
            } else if (e instanceof NoOpenProjectsError) {
                this.messenger.sendUnrecoverableErrorResponse('no-project-found', message.tabID)
            }
        }
        return []
    }

    private async formActionClicked(message: any) {
        const typedAction = MessengerUtils.stringToEnumValue(ButtonActions, message.action as any)
        switch (typedAction) {
            case ButtonActions.CONFIRM_LANGUAGE_UPGRADE_TRANSFORMATION_FORM:
                await this.handleUserLanguageUpgradeProjectChoice(message)
                break
            case ButtonActions.CANCEL_TRANSFORMATION_FORM:
                telemetry.codeTransform_submitSelection.emit({
                    codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                    userChoice: 'Cancel',
                    result: MetadataResult.Pass,
                })
                this.transformationFinished({
                    message: CodeWhispererConstants.jobCancelledChatMessage,
                    tabID: message.tabID,
                    includeStartNewTransformationButton: true,
                })
                break
            case ButtonActions.CONFIRM_SKIP_TESTS_FORM:
                await this.handleSkipTestsSelection(message)
                break
            case ButtonActions.CANCEL_SKIP_TESTS_FORM:
                this.messenger.sendJobFinishedMessage(message.tabID, CodeWhispererConstants.jobCancelledChatMessage)
                break
            case ButtonActions.CONFIRM_SELECTIVE_TRANSFORMATION_FORM:
                await this.handleOneOrMultipleDiffs(message)
                break
            case ButtonActions.CANCEL_SELECTIVE_TRANSFORMATION_FORM:
                this.messenger.sendJobFinishedMessage(message.tabID, CodeWhispererConstants.jobCancelledChatMessage)
                break
            case ButtonActions.CONFIRM_SQL_CONVERSION_TRANSFORMATION_FORM:
                await this.handleUserSQLConversionProjectSelection(message)
                break
            case ButtonActions.SELECT_SQL_CONVERSION_METADATA_FILE:
                await this.processMetadataFile(message)
                break
            case ButtonActions.VIEW_TRANSFORMATION_HUB:
                await vscode.commands.executeCommand(GumbyCommands.FOCUS_TRANSFORMATION_HUB, CancelActionPositions.Chat)
                this.messenger.sendJobSubmittedMessage(message.tabID)
                break
            case ButtonActions.STOP_TRANSFORMATION_JOB:
                await stopTransformByQ(transformByQState.getJobId())
                await postTransformationJob()
                await cleanupTransformationJob()
                break
            case ButtonActions.CONFIRM_START_TRANSFORMATION_FLOW:
                this.resetTransformationChatFlow()
                this.messenger.sendCommandMessage({ ...message, command: GumbyCommands.CLEAR_CHAT })
                await this.transformInitiated(message)
                break
            case ButtonActions.CONFIRM_DEPENDENCY_FORM:
                await this.continueJobWithSelectedDependency(message)
                break
            case ButtonActions.CANCEL_DEPENDENCY_FORM:
                this.messenger.sendUserPrompt('Cancel', message.tabID)
                await this.continueTransformationWithoutHIL(message)
                break
            case ButtonActions.OPEN_FILE:
                await openHilPomFile()
                break
            case ButtonActions.OPEN_BUILD_LOG:
                await openBuildLogFile()
                this.messenger.sendViewBuildLog(message.tabID)
                break
        }
    }

    private async handleSkipTestsSelection(message: any) {
        await telemetry.codeTransform_submitSelection.run(async () => {
            const skipTestsSelection = message.formSelectedValues['GumbyTransformSkipTestsForm']
            if (skipTestsSelection === CodeWhispererConstants.skipUnitTestsMessage) {
                transformByQState.setCustomBuildCommand(CodeWhispererConstants.skipUnitTestsBuildCommand)
            } else {
                transformByQState.setCustomBuildCommand(CodeWhispererConstants.doNotSkipUnitTestsBuildCommand)
            }
            telemetry.record({
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                userChoice: skipTestsSelection,
            })
            this.messenger.sendSkipTestsSelectionMessage(skipTestsSelection, message.tabID)
            await this.messenger.sendOneOrMultipleDiffsPrompt(message.tabID)
        })
    }

    private async handleOneOrMultipleDiffs(message: any) {
        await telemetry.codeTransform_submitSelection.run(async () => {
            const oneOrMultipleDiffsSelection = message.formSelectedValues['GumbyTransformOneOrMultipleDiffsForm']
            if (oneOrMultipleDiffsSelection === CodeWhispererConstants.multipleDiffsMessage) {
                transformByQState.setMultipleDiffs(true)
            } else {
                transformByQState.setMultipleDiffs(false)
            }

            telemetry.record({
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                userChoice: oneOrMultipleDiffsSelection,
            })

            this.messenger.sendOneOrMultipleDiffsMessage(oneOrMultipleDiffsSelection, message.tabID)
            // perform local build
            await this.validateBuildWithPromptOnError(message)
        })
    }

    private async handleUserLanguageUpgradeProjectChoice(message: any) {
        await telemetry.codeTransform_submitSelection.run(async () => {
            const pathToProject: string = message.formSelectedValues['GumbyTransformLanguageUpgradeProjectForm']
            const toJDKVersion: JDKVersion = message.formSelectedValues['GumbyTransformJdkToForm']
            const fromJDKVersion: JDKVersion = message.formSelectedValues['GumbyTransformJdkFromForm']

            telemetry.record({
                // TODO: remove JavaSource/TargetVersionsAllowed when BI is updated to use source/target
                codeTransformJavaSourceVersionsAllowed: JDKToTelemetryValue(
                    fromJDKVersion
                ) as CodeTransformJavaSourceVersionsAllowed,
                codeTransformJavaTargetVersionsAllowed: JDKToTelemetryValue(
                    toJDKVersion
                ) as CodeTransformJavaTargetVersionsAllowed,
                source: fromJDKVersion,
                target: toJDKVersion,
                codeTransformProjectId: pathToProject === undefined ? telemetryUndefined : getStringHash(pathToProject),
                userChoice: 'Confirm-Java',
            })

            const projectName = path.basename(pathToProject)
            this.messenger.sendLanguageUpgradeProjectChoiceMessage(
                projectName,
                fromJDKVersion,
                toJDKVersion,
                message.tabID
            )

            await processLanguageUpgradeTransformFormInput(pathToProject, fromJDKVersion, toJDKVersion)
            await this.messenger.sendSkipTestsPrompt(message.tabID)
        })
    }

    private async handleUserSQLConversionProjectSelection(message: any) {
        await telemetry.codeTransform_submitSelection.run(async () => {
            const pathToProject: string = message.formSelectedValues['GumbyTransformSQLConversionProjectForm']
            const schema: string = message.formSelectedValues['GumbyTransformSQLSchemaForm']

            telemetry.record({
                codeTransformProjectId: pathToProject === undefined ? telemetryUndefined : getStringHash(pathToProject),
                source: transformByQState.getSourceDB(),
                target: transformByQState.getTargetDB(),
                userChoice: 'Confirm-SQL',
            })

            const projectName = path.basename(pathToProject)
            this.messenger.sendSQLConversionProjectSelectionMessage(projectName, schema, message.tabID)

            await processSQLConversionTransformFormInput(pathToProject, schema)

            this.messenger.sendAsyncEventProgress(
                message.tabID,
                true,
                undefined,
                GumbyNamedMessages.JOB_SUBMISSION_STATUS_MESSAGE
            )
            this.messenger.sendJobSubmittedMessage(message.tabID)
            this.sessionStorage.getSession().conversationState = ConversationState.JOB_SUBMITTED
            await startTransformByQ()
        })
    }

    private async prepareLanguageUpgradeProject(message: { pathToJavaHome: string; tabID: string }) {
        if (message.pathToJavaHome) {
            transformByQState.setJavaHome(message.pathToJavaHome)
            getLogger().info(
                `CodeTransformation: using JAVA_HOME = ${transformByQState.getJavaHome()} since source JDK does not match Maven JDK`
            )
        }

        // Pre-build project locally
        try {
            this.sessionStorage.getSession().conversationState = ConversationState.COMPILING
            this.messenger.sendCompilationInProgress(message.tabID)
            await compileProject()
        } catch (err: any) {
            this.messenger.sendUnrecoverableErrorResponse('could-not-compile-project', message.tabID)
            // reset state to allow "Start a new transformation" button to work
            this.sessionStorage.getSession().conversationState = ConversationState.IDLE
            throw err
        }

        this.messenger.sendCompilationFinished(message.tabID)

        // since compilation can potentially take a long time, double check auth
        const authState = await AuthUtil.instance.getChatAuthState()
        if (authState.amazonQ !== 'connected') {
            void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
            this.sessionStorage.getSession().isAuthenticating = true
            return
        }

        // give user a non-blocking warning if build file appears to contain absolute paths
        await parseBuildFile()

        this.messenger.sendAsyncEventProgress(
            message.tabID,
            true,
            undefined,
            GumbyNamedMessages.JOB_SUBMISSION_STATUS_MESSAGE
        )
        this.messenger.sendJobSubmittedMessage(message.tabID)
        this.sessionStorage.getSession().conversationState = ConversationState.JOB_SUBMITTED
        await startTransformByQ()
    }

    // only for Language Upgrades
    private async validateBuildWithPromptOnError(message: any | undefined = undefined): Promise<void> {
        try {
            // Check Java Home is set (not yet prebuilding)
            await validateCanCompileProject()
        } catch (err: any) {
            if (err instanceof JavaHomeNotSetError) {
                this.sessionStorage.getSession().conversationState = ConversationState.PROMPT_JAVA_HOME
                this.messenger.sendStaticTextResponse('java-home-not-set', message.tabID)
                this.messenger.sendChatInputEnabled(message.tabID, true)
                this.messenger.sendUpdatePlaceholder(message.tabID, 'Enter the path to your Java installation.')
            }
            return
        }

        await this.prepareLanguageUpgradeProject(message)
    }

    private async processMetadataFile(message: any) {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Select',
            filters: {
                'SCT metadata': ['zip'], // Restrict user to only pick a .zip file
            },
        })

        if (!fileUri || fileUri.length === 0) {
            // user closed the dialog
            this.transformationFinished({
                message: CodeWhispererConstants.jobCancelledChatMessage,
                tabID: message.tabID,
                includeStartNewTransformationButton: true,
            })
            return
        }

        const metadataZip = new AdmZip(fileUri[0].fsPath)
        const fileEntries = metadataZip.getEntries()
        const metadataFile = fileEntries.find((entry) => entry.name.endsWith('.sct'))
        if (!metadataFile) {
            this.messenger.sendUnrecoverableErrorResponse('invalid-zip-no-sct-file', message.tabID)
            return
        }

        const fileContents = metadataFile.getData().toString('utf-8')

        const isValidMetadata = await validateSQLMetadataFile(fileContents, message)
        if (!isValidMetadata) {
            return
        }

        this.messenger.sendSQLConversionMetadataReceivedMessage(message.tabID)
        transformByQState.setMetadataPathSQL(fileUri[0].fsPath)

        await this.messenger.sendSQLConversionProjectPrompt(
            Array.from(this.sessionStorage.getSession().candidateProjects.values()),
            message.tabID
        )
    }

    private transformationFinished(data: {
        message: string | undefined
        tabID: string
        includeStartNewTransformationButton: boolean
    }) {
        this.resetTransformationChatFlow()
        // at this point job is either completed, partially_completed, cancelled, or failed
        if (data.message) {
            this.messenger.sendJobFinishedMessage(data.tabID, data.message, data.includeStartNewTransformationButton)
        }
    }

    private resetTransformationChatFlow() {
        this.sessionStorage.getSession().conversationState = ConversationState.IDLE
    }

    private startHILIntervention(data: { tabID: string; codeSnippet: string }) {
        this.sessionStorage.getSession().conversationState = ConversationState.WAITING_FOR_HIL_INPUT
        this.messenger.sendHumanInTheLoopInitialMessage(data.tabID, data.codeSnippet)
    }

    private HILPromptForDependency(data: { tabID: string; dependencies: DependencyVersions }) {
        this.messenger.sendDependencyVersionsFoundMessage(data.dependencies, data.tabID)
    }

    private HILDependencySelectionUploaded(data: { tabID: string }) {
        this.sessionStorage.getSession().conversationState = ConversationState.JOB_SUBMITTED
        this.messenger.sendHILResumeMessage(data.tabID)
    }

    private async processHumanChatMessage(data: { message: string; tabID: string }) {
        this.messenger.sendUserPrompt(data.message, data.tabID)
        this.messenger.sendChatInputEnabled(data.tabID, false)
        this.messenger.sendUpdatePlaceholder(data.tabID, 'Open a new tab to chat with Q')

        const session = this.sessionStorage.getSession()
        switch (session.conversationState) {
            case ConversationState.PROMPT_JAVA_HOME: {
                const pathToJavaHome = extractPath(data.message)
                if (pathToJavaHome) {
                    await this.prepareLanguageUpgradeProject({
                        pathToJavaHome,
                        tabID: data.tabID,
                    })
                } else {
                    this.messenger.sendUnrecoverableErrorResponse('invalid-java-home', data.tabID)
                }
                break
            }

            case ConversationState.WAITING_FOR_TRANSFORMATION_OBJECTIVE: {
                const objective = data.message.trim().toLowerCase()
                // since we're prompting the user, their project(s) must be eligible for both types of transformations, so track how often this happens here
                if (objective === 'language upgrade' || objective === 'sql conversion') {
                    telemetry.codeTransform_submitSelection.emit({
                        codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                        userChoice: objective,
                        result: 'Succeeded',
                    })
                }
                if (objective === 'language upgrade') {
                    await this.handleLanguageUpgrade(data)
                } else if (objective === 'sql conversion') {
                    await this.handleSQLConversion(data)
                } else {
                    // keep prompting user until they enter a valid option
                    await this.transformInitiated(data)
                }
                break
            }
        }
    }

    private async continueJobWithSelectedDependency(message: { tabID: string; formSelectedValues: any }) {
        const selectedDependency = message.formSelectedValues['GumbyTransformDependencyForm']
        this.messenger.sendHILContinueMessage(message.tabID, selectedDependency)
        await finishHumanInTheLoop(selectedDependency)
    }

    private openLink(message: { link: string }) {
        void openUrl(vscode.Uri.parse(message.link))
    }

    private async handleError(message: { error: Error; tabID: string }) {
        if (message.error instanceof AlternateDependencyVersionsNotFoundError) {
            this.messenger.sendKnownErrorResponse(message.tabID, CodeWhispererConstants.dependencyVersionsErrorMessage)
            await this.continueTransformationWithoutHIL(message)
        } else if (message.error instanceof ModuleUploadError) {
            this.resetTransformationChatFlow()
        } else if (message.error instanceof JobStartError) {
            this.resetTransformationChatFlow()
        } else if (message.error instanceof TransformationPreBuildError) {
            this.messenger.sendJobSubmittedMessage(message.tabID, true)
            this.messenger.sendAsyncEventProgress(
                message.tabID,
                true,
                undefined,
                GumbyNamedMessages.JOB_FAILED_IN_PRE_BUILD
            )
            await openBuildLogFile()
            this.messenger.sendViewBuildLog(message.tabID)
        } else if (message.error instanceof AbsolutePathDetectedError) {
            this.messenger.sendKnownErrorResponse(message.tabID, message.error.message)
        }
    }

    private async continueTransformationWithoutHIL(message: { tabID: string }) {
        this.sessionStorage.getSession().conversationState = ConversationState.JOB_SUBMITTED
        CodeTransformTelemetryState.instance.setCodeTransformMetaDataField({
            canceledFromChat: true,
        })
        try {
            await finishHumanInTheLoop()
        } catch (err: any) {
            this.transformationFinished({
                tabID: message.tabID,
                message: (err as Error).message,
                includeStartNewTransformationButton: true,
            })
        }

        this.messenger.sendStaticTextResponse('end-HIL-early', message.tabID)
    }
}

/**
 * Examples:
 * ```
 * extractPath("./some/path/here") => "C:/some/root/some/path/here"
 * extractPath(" ./some/path/here\n") => "C:/some/root/some/path/here"
 * extractPath("C:/some/nonexistent/path/here") => undefined
 * extractPath("C:/some/filepath/.txt") => undefined
 * ```
 *
 * @param text
 * @returns the absolute path if path points to existing folder, otherwise undefined
 */
function extractPath(text: string): string | undefined {
    const resolvedPath = path.resolve(text.trim())
    return nodefs.existsSync(resolvedPath) ? resolvedPath : undefined
}
