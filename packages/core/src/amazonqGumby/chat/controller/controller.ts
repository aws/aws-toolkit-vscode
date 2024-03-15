/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for responding to UI events by calling
 * the Gumby extension.
 */

import { GumbyNamedMessages, Messenger } from './messenger/messenger'
import { AuthController } from '../../../amazonq/auth/controller'
import { ChatSessionStorage } from '../storages/chatSession'
import * as vscode from 'vscode'
import { Session } from '../session/session'
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
import { transformByQState } from '../../../codewhisperer/models/model'
import { JavaHomeNotSetError, NoJavaProjectsFoundError, NoMavenJavaProjectsFoundError } from '../../errors'
import MessengerUtils, { ButtonActions, GumbyCommands } from './messenger/messengerUtils'
import { TransformationCandidateProject } from '../../../codewhisperer/service/transformByQHandler'
import { CancelActionPositions } from '../../telemetry/codeTransformTelemetry'

// Define the chat / IDE events to listen to
export interface ChatControllerEventEmitters {
    readonly transformSelected: vscode.EventEmitter<any>
    readonly tabOpened: vscode.EventEmitter<any>
    readonly tabClosed: vscode.EventEmitter<any>
    readonly authClicked: vscode.EventEmitter<any>
    readonly formActionClicked: vscode.EventEmitter<any>
    readonly commandSentFromIDE: vscode.EventEmitter<any>
    readonly transformationFinished: vscode.EventEmitter<any>
}

export class GumbyController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionStorage
    private authController: AuthController

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: Messenger,
        sessionStorage: ChatSessionStorage,
        onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.messenger = messenger
        this.sessionStorage = sessionStorage
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
    }

    private async tabOpened(message: any) {
        let session: Session | undefined
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            getLogger().debug(`${featureName}: Session created with id: ${session.tabID}`)

            const authState = await getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }
        } catch (err: any) {
            this.messenger.sendErrorMessage(err.message, message.tabID)
        }
    }

    private async tabClosed(data: any) {
        transformByQState.setGumbyChatTabID(undefined)
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
        transformByQState.setGumbyChatTabID(message.tabID)

        // check that a project is open
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            this.messenger.sendStaticTextResponse('no-project-found', message.tabID)
            return
        }

        // check that the session is authenticated
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

            const authState = await getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                await this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }

            // check to see if a transformation is already in progress
            if (transformByQState.isRunning()) {
                this.messenger.sendAsyncEventProgress(
                    message.tabID,
                    true,
                    undefined,
                    GumbyNamedMessages.JOB_SUBMISSION_STATUS_MESSAGE
                )
                this.messenger.sendJobSubmittedMessage(message.tabID)
                return
            }

            this.messenger.sendTransformationIntroduction(message.tabID)

            // start /transform chat flow
            const validProjects = await this.validateProjectsWithReplyOnError(message)
            if (validProjects.length > 0) {
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
                this.messenger.sendStaticTextResponse('no-java-project-found', message.tabID)
            } else if (err instanceof NoMavenJavaProjectsFoundError) {
                this.messenger.sendStaticTextResponse('no-maven-java-project-found', message.tabID)
            } else {
                this.messenger.sendStaticTextResponse('no-project-found', message.tabID)
            }
        }
        return []
    }

    private async formActionClicked(message: any) {
        const typedAction = MessengerUtils.stringToEnumValue(ButtonActions, message.action as any)
        switch (typedAction) {
            case ButtonActions.CONFIRM_TRANSFORMATION_FORM:
                await this.initiateTransformationOnModule(message)
                break
            case ButtonActions.CANCEL_TRANSFORMATION_FORM:
                this.messenger.sendJobFinishedMessage(message.tabId, true, undefined)
                break
            case ButtonActions.CONFIRM_JAVA_HOME_FORM:
                await this.prepareProjectForSubmission(message)
                break
            case ButtonActions.CANCEL_JAVA_HOME_FORM:
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

    // Any given project could have multiple candidate modules to transform --
    // The user gets prompted to pick a specific one
    private async initiateTransformationOnModule(message: any) {
        const pathToModule: string = message.formSelectedValues['GumbyTransformModuleForm']
        const fromJDKVersion: string = message.formSelectedValues['GumbyTransformJdkFromForm']
        const toJDKVersion: string = message.formSelectedValues['GumbyTransformJdkToForm']

        this.messenger.sendCompilationInProgress(message.tabId, true)

        await processTransformFormInput(pathToModule, fromJDKVersion, toJDKVersion)
        await this.validateBuildWithPromptOnError(message)
    }

    private async prepareProjectForSubmission(message: any | undefined = undefined): Promise<void> {
        if (message !== undefined && message.formSelectedValues !== undefined) {
            const javaHome: string = message.formSelectedValues['JavaHomeFormInput'].trim()

            if (!javaHome) {
                const errorMessage = 'No JDK path provided'
                this.messenger.sendErrorMessage(errorMessage, message.tabID)
                throw new JavaHomeNotSetError()
            }

            transformByQState.setJavaHome(javaHome)
            getLogger().info(
                `CodeTransformation: using JAVA_HOME = ${transformByQState.getJavaHome()} since source JDK does not match Maven JDK`
            )
        }

        try {
            this.messenger.sendCompilationInProgress(message.tabId, false)
            await compileProject()

            this.messenger.sendCompilationFinished(message.tabId)
            this.messenger.sendAsyncEventProgress(
                message.tabId,
                true,
                undefined,
                GumbyNamedMessages.JOB_SUBMISSION_STATUS_MESSAGE
            )
            this.messenger.sendJobSubmittedMessage(message.tabId)
            await startTransformByQ()
        } catch (err: any) {
            this.messenger.sendStaticTextResponse('could-not-compile-project', message.tabId)
        }
    }

    private async validateBuildWithPromptOnError(message: any | undefined = undefined): Promise<void> {
        try {
            await validateCanCompileProject()
        } catch (err: any) {
            if (err instanceof JavaHomeNotSetError) {
                const prompt = MessengerUtils.createJavaHomePrompt()
                this.messenger.sendTextInputPrompt(prompt, 'JavaHomeForm', message.tabId)
                return
            }
            throw err
        }

        await this.prepareProjectForSubmission()
    }

    private async transformationFinished(message: { tabID: string; jobStatus: string }) {
        this.messenger.sendJobSubmittedMessage(message.tabID, true)
        this.messenger.sendJobFinishedMessage(message.tabID, false, message.jobStatus)
    }
}
