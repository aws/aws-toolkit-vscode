/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for responding to UI events by calling
 * the Gumby extension.
 */

import { GumbyNamedMessages, Messenger } from './messenger/messenger'
import { AuthController } from '../../../amazonq/auth/controller'
import { ChatSessionManager } from '../storages/chatSession'
import * as vscode from 'vscode'
import { ConversationState, Session } from '../session/session'
import { getLogger } from '../../../shared/logger'
import { featureName } from '../../models/constants'
import { getChatAuthState } from '../../../codewhisperer/util/authUtil'
import {
    compileProject,
    getValidCandidateProjects,
    processTransformFormInput,
    startTransformByQ,
    stopTransformByQ,
    validateCanCompileProject,
} from '../../../codewhisperer/commands/startTransformByQ'
import { JDKVersion, transformByQState } from '../../../codewhisperer/models/model'
import { JavaHomeNotSetError, NoJavaProjectsFoundError, NoMavenJavaProjectsFoundError } from '../../errors'
import MessengerUtils, { ButtonActions, GumbyCommands } from './messenger/messengerUtils'
import { TransformationCandidateProject } from '../../../codewhisperer/service/transformByQHandler'
import { CancelActionPositions } from '../../telemetry/codeTransformTelemetry'
import fs from 'fs'
import path from 'path'
import { openUrl } from '../../../shared/utilities/vsCodeUtils'

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

        this.chatControllerMessageListeners.transformSelected.event(data => {
            return this.transformInitiated(data)
        })

        this.chatControllerMessageListeners.tabOpened.event(data => {
            return this.tabOpened(data)
        })

        this.chatControllerMessageListeners.tabClosed.event(data => {
            return this.tabClosed(data)
        })

        this.chatControllerMessageListeners.authClicked.event(data => {
            this.authClicked(data)
        })

        this.chatControllerMessageListeners.commandSentFromIDE.event(data => {
            return this.commandSentFromIDE(data)
        })

        this.chatControllerMessageListeners.formActionClicked.event(data => {
            return this.formActionClicked(data)
        })

        this.chatControllerMessageListeners.transformationFinished.event(data => {
            return this.transformationFinished(data)
        })

        this.chatControllerMessageListeners.processHumanChatMessage.event(data => {
            return this.processHumanChatMessage(data)
        })

        this.chatControllerMessageListeners.linkClicked.event(data => {
            this.openLink(data)
        })
    }

    private async tabOpened(message: any) {
        const session: Session = this.sessionStorage.getSession()
        const tabID = this.sessionStorage.setActiveTab(message.tabID)

        // check if authentication has expired
        try {
            getLogger().debug(`${featureName}: Session created with id: ${session.tabID}`)

            const authState = await getChatAuthState()
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
        // check that a project is open
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            this.messenger.sendRetryableErrorResponse('no-project-found', message.tabID)
            return
        }

        // check that the session is authenticated
        const session: Session = this.sessionStorage.getSession()
        try {
            const authState = await getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }

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

            this.messenger.sendTransformationIntroduction(message.tabID)

            // start /transform chat flow
            const validProjects = await this.validateProjectsWithReplyOnError(message)
            if (validProjects.length > 0) {
                this.sessionStorage.getSession().updateCandidateProjects(validProjects)
                await this.messenger.sendProjectPrompt(validProjects, message.tabID)
            }
        } catch (err: any) {
            // if there was an issue getting the list of valid projects, the error message
            // will be shown here
            this.messenger.sendErrorMessage(err.message, message.tabID)
        }
    }

    private async validateProjectsWithReplyOnError(message: any): Promise<TransformationCandidateProject[]> {
        try {
            return await getValidCandidateProjects()
        } catch (err: any) {
            if (err instanceof NoJavaProjectsFoundError) {
                this.messenger.sendRetryableErrorResponse('no-java-project-found', message.tabID)
            } else if (err instanceof NoMavenJavaProjectsFoundError) {
                this.messenger.sendRetryableErrorResponse('no-maven-java-project-found', message.tabID)
            } else {
                this.messenger.sendRetryableErrorResponse('no-project-found', message.tabID)
            }
        }
        return []
    }

    private async formActionClicked(message: any) {
        const typedAction = MessengerUtils.stringToEnumValue(ButtonActions, message.action as any)
        switch (typedAction) {
            case ButtonActions.CONFIRM_TRANSFORMATION_FORM:
                await this.initiateTransformationOnProject(message)
                break
            case ButtonActions.CANCEL_TRANSFORMATION_FORM:
                this.messenger.sendJobFinishedMessage(message.tabId, true, undefined)
                break
            case ButtonActions.VIEW_TRANSFORMATION_HUB:
                await vscode.commands.executeCommand(GumbyCommands.FOCUS_TRANSFORMATION_HUB)
                this.messenger.sendJobSubmittedMessage(message.tabId)
                break
            case ButtonActions.STOP_TRANSFORMATION_JOB:
                await stopTransformByQ(transformByQState.getJobId(), CancelActionPositions.Chat)
                this.messenger.sendJobFinishedMessage(message.tabId, true)
                break
            case ButtonActions.CONFIRM_START_TRANSFORMATION_FLOW:
                this.messenger.sendCommandMessage({ ...message, command: GumbyCommands.CLEAR_CHAT })
                await this.transformInitiated({ ...message, tabID: message.tabId })
                break
        }
    }

    // Any given project could have multiple candidate projects to transform --
    // The user gets prompted to pick a specific one
    private async initiateTransformationOnProject(message: any) {
        const pathToProject: string = message.formSelectedValues['GumbyTransformProjectForm']
        const toJDKVersion: JDKVersion = message.formSelectedValues['GumbyTransformJdkToForm']
        const fromJDKVersion: JDKVersion = message.formSelectedValues['GumbyTransformJdkFromForm']

        const projectName = path.basename(pathToProject)
        this.messenger.sendProjectSelectionMessage(projectName, fromJDKVersion, toJDKVersion, message.tabId)

        if (fromJDKVersion === JDKVersion.UNSUPPORTED) {
            this.messenger.sendRetryableErrorResponse('unsupported-source-jdk-version', message.tabId)
            return
        }

        await processTransformFormInput(pathToProject, fromJDKVersion, toJDKVersion)
        await this.validateBuildWithPromptOnError(message)
    }

    private async prepareProjectForSubmission(message: { pathToJavaHome: string; tabID: string }): Promise<void> {
        if (message.pathToJavaHome) {
            transformByQState.setJavaHome(message.pathToJavaHome)
            getLogger().info(
                `CodeTransformation: using JAVA_HOME = ${transformByQState.getJavaHome()} since source JDK does not match Maven JDK`
            )
        }

        try {
            this.sessionStorage.getSession().conversationState = ConversationState.COMPILING
            this.messenger.sendCompilationInProgress(message.tabID)
            await compileProject()
        } catch (err: any) {
            this.messenger.sendRetryableErrorResponse('could-not-compile-project', message.tabID)
            throw err
        }

        this.messenger.sendCompilationFinished(message.tabID)

        const authState = await getChatAuthState()
        if (authState.amazonQ !== 'connected') {
            void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
            this.sessionStorage.getSession().isAuthenticating = true
            return
        }

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

    private async validateBuildWithPromptOnError(message: any | undefined = undefined): Promise<void> {
        try {
            await validateCanCompileProject()
        } catch (err: any) {
            if (err instanceof JavaHomeNotSetError) {
                this.sessionStorage.getSession().conversationState = ConversationState.PROMPT_JAVA_HOME
                this.messenger.sendStaticTextResponse('java-home-not-set', message.tabId)
                this.messenger.sendChatInputEnabled(message.tabId, true)
                this.messenger.sendUpdatePlaceholder(message.tabId, 'Enter the path to your Java installation.')
                return
            }
            throw err
        }

        await this.prepareProjectForSubmission(message)
    }

    private async transformationFinished(message: { tabID: string; jobStatus: string }) {
        this.sessionStorage.getSession().conversationState = ConversationState.IDLE
        this.messenger.sendJobSubmittedMessage(message.tabID, true)
        this.messenger.sendJobFinishedMessage(message.tabID, false, message.jobStatus)
    }

    private async processHumanChatMessage(data: { message: string; tabID: string }) {
        this.messenger.sendUserPrompt(data.message, data.tabID)
        this.messenger.sendChatInputEnabled(data.tabID, false)
        this.messenger.sendUpdatePlaceholder(data.tabID, 'Chat is disabled during Code Transformation.')

        const session = this.sessionStorage.getSession()
        switch (session.conversationState) {
            case ConversationState.PROMPT_JAVA_HOME: {
                const pathToJavaHome = extractPath(data.message)

                if (pathToJavaHome) {
                    await this.prepareProjectForSubmission({
                        pathToJavaHome,
                        tabID: data.tabID,
                    })
                } else {
                    this.messenger.sendRetryableErrorResponse('invalid-java-home', data.tabID)
                    this.messenger.sendJobFinishedMessage(data.tabID, true, undefined)
                }
            }
        }
    }

    private openLink(message: { link: string }) {
        void openUrl(vscode.Uri.parse(message.link))
    }
}

function extractPath(text: string): string | undefined {
    const words = text.split(/\s+/) // Split text into words by whitespace

    // Filter words that are formatted like paths and do exist as local directories
    const paths = words.find(word => fs.existsSync(word) && fs.lstatSync(word).isDirectory())

    return paths
}
