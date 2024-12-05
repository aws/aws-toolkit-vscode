/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { EventEmitter } from 'vscode'

import {
    DocGenerationStep,
    EditDocumentation,
    FolderSelectorFollowUps,
    Mode,
    SynchronizeDocumentation,
    docScheme,
    featureName,
    findReadmePath,
} from '../../constants'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getLogger } from '../../../shared/logger'

import { Session } from '../../session/session'
import { i18n } from '../../../shared/i18n-helper'
import { telemetry } from '../../../shared/telemetry'
import path from 'path'
import { createSingleFileDialog } from '../../../shared/ui/common/openDialog'
import { MynahIcons } from '@aws/mynah-ui'

import {
    MonthlyConversationLimitError,
    SelectedFolderNotInWorkspaceFolderError,
    WorkspaceFolderNotFoundError,
    createUserFacingErrorMessage,
} from '../../../amazonqFeatureDev/errors'
import { BaseChatSessionStorage } from '../../../amazonq/commons/baseChatStorage'
import { DocMessenger } from '../../messenger'
import { AuthController } from '../../../amazonq/auth/controller'
import { openUrl } from '../../../shared/utilities/vsCodeUtils'
import { openDeletedDiff, openDiff } from '../../../amazonq/commons/diff'
import {
    getWorkspaceFoldersByPrefixes,
    getWorkspaceRelativePath,
    isMultiRootWorkspace,
} from '../../../shared/utilities/workspaceUtils'
import { getPathsFromZipFilePath } from '../../../amazonqFeatureDev/util/files'
import { FollowUpTypes } from '../../../amazonq/commons/types'
import { DocGenerationTask } from '../docGenerationTask'

export interface ChatControllerEventEmitters {
    readonly processHumanChatMessage: EventEmitter<any>
    readonly followUpClicked: EventEmitter<any>
    readonly openDiff: EventEmitter<any>
    readonly stopResponse: EventEmitter<any>
    readonly tabOpened: EventEmitter<any>
    readonly tabClosed: EventEmitter<any>
    readonly processChatItemVotedMessage: EventEmitter<any>
    readonly processChatItemFeedbackMessage: EventEmitter<any>
    readonly authClicked: EventEmitter<any>
    readonly processResponseBodyLinkClick: EventEmitter<any>
    readonly insertCodeAtPositionClicked: EventEmitter<any>
    readonly fileClicked: EventEmitter<any>
    readonly formActionClicked: EventEmitter<any>
}

export class DocController {
    private readonly scheme = docScheme
    private readonly messenger: DocMessenger
    private readonly sessionStorage: BaseChatSessionStorage<Session>
    private authController: AuthController
    private folderPath = ''
    private mode: Mode = Mode.NONE
    public docGenerationTask: DocGenerationTask

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: DocMessenger,
        sessionStorage: BaseChatSessionStorage<Session>,
        _onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.messenger = messenger
        this.sessionStorage = sessionStorage
        this.authController = new AuthController()
        this.docGenerationTask = new DocGenerationTask()

        this.chatControllerMessageListeners.processHumanChatMessage.event((data) => {
            this.processUserChatMessage(data).catch((e) => {
                getLogger().error('processUserChatMessage failed: %s', (e as Error).message)
            })
        })
        this.chatControllerMessageListeners.formActionClicked.event((data) => {
            return this.formActionClicked(data)
        })

        this.initializeFollowUps()

        this.chatControllerMessageListeners.stopResponse.event((data) => {
            return this.stopResponse(data)
        })
        this.chatControllerMessageListeners.tabOpened.event((data) => {
            return this.tabOpened(data)
        })
        this.chatControllerMessageListeners.tabClosed.event((data) => {
            this.tabClosed(data)
        })
        this.chatControllerMessageListeners.authClicked.event((data) => {
            this.authClicked(data)
        })
        this.chatControllerMessageListeners.processResponseBodyLinkClick.event((data) => {
            this.processLink(data)
        })
        this.chatControllerMessageListeners.fileClicked.event(async (data) => {
            return await this.fileClicked(data)
        })
        this.chatControllerMessageListeners.openDiff.event(async (data) => {
            return await this.openDiff(data)
        })
    }

    /** Prompts user to choose a folder in current workspace for README creation/update.
     * After user chooses a folder, displays confirmation message to user with selected path.
     *
     */
    private async folderSelector(data: any) {
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: data.tabID,
            message: i18n('AWS.amazonq.doc.answer.chooseFolder'),
            disableChatInput: true,
        })

        const uri = await createSingleFileDialog({
            canSelectFolders: true,
            canSelectFiles: false,
        }).prompt()

        const retryFollowUps = FolderSelectorFollowUps.filter(
            (followUp) => followUp.type !== FollowUpTypes.ProceedFolderSelection
        )

        if (!(uri instanceof vscode.Uri)) {
            this.messenger.sendAnswer({
                type: 'answer',
                tabID: data.tabID,
                message: i18n('AWS.amazonq.doc.error.noFolderSelected'),
                followUps: retryFollowUps,
                disableChatInput: true,
            })
            // Check that selected folder is a subfolder of the current workspace
        } else if (!vscode.workspace.getWorkspaceFolder(uri)) {
            this.messenger.sendAnswer({
                type: 'answer',
                tabID: data.tabID,
                message: new SelectedFolderNotInWorkspaceFolderError().message,
                followUps: retryFollowUps,
                disableChatInput: true,
            })
        } else {
            let displayPath = ''
            const relativePath = getWorkspaceRelativePath(uri.fsPath)

            if (relativePath) {
                // Display path should always include workspace folder name
                displayPath = path.join(relativePath.workspaceFolder.name, relativePath.relativePath)
                // Only include workspace folder name in API call if multi-root workspace
                this.folderPath = isMultiRootWorkspace() ? displayPath : relativePath.relativePath

                if (!relativePath.relativePath) {
                    this.docGenerationTask.folderLevel = 'ENTIRE_WORKSPACE'
                } else {
                    this.docGenerationTask.folderLevel = 'SUB_FOLDER'
                }
            }

            this.messenger.sendFolderConfirmationMessage(
                data.tabID,
                this.mode === Mode.CREATE
                    ? i18n('AWS.amazonq.doc.answer.createReadme')
                    : i18n('AWS.amazonq.doc.answer.updateReadme'),
                displayPath,
                FolderSelectorFollowUps
            )
            this.messenger.sendChatInputEnabled(data.tabID, false)
        }
    }

    private async openDiff(message: any) {
        const tabId: string = message.tabID
        const codeGenerationId: string = message.messageId
        const zipFilePath: string = message.filePath
        const session = await this.sessionStorage.getSession(tabId)
        telemetry.amazonq_isReviewedChanges.emit({
            amazonqConversationId: session.conversationId,
            enabled: true,
            result: 'Succeeded',
            credentialStartUrl: AuthUtil.instance.startUrl,
        })

        const workspacePrefixMapping = getWorkspaceFoldersByPrefixes(session.config.workspaceFolders)
        const pathInfos = getPathsFromZipFilePath(zipFilePath, workspacePrefixMapping, session.config.workspaceFolders)

        const extension = path.parse(message.filePath).ext
        // Only open diffs on files, not directories
        if (extension) {
            if (message.deleted) {
                const name = path.basename(pathInfos.relativePath)
                await openDeletedDiff(pathInfos.absolutePath, name, tabId, this.scheme)
            } else {
                let uploadId = session.uploadId
                if (session?.state?.uploadHistory && session.state.uploadHistory[codeGenerationId]) {
                    uploadId = session?.state?.uploadHistory[codeGenerationId].uploadId
                }
                const rightPath = path.join(uploadId, zipFilePath)
                await openDiff(pathInfos.absolutePath, rightPath, tabId, this.scheme)
            }
        }
    }

    private initializeFollowUps(): void {
        this.chatControllerMessageListeners.followUpClicked.event(async (data) => {
            const session: Session = await this.sessionStorage.getSession(data.tabID)

            const workspaceFolders = vscode.workspace.workspaceFolders
            if (workspaceFolders === undefined || workspaceFolders.length === 0) {
                return
            }

            const workspaceFolderName = vscode.workspace.workspaceFolders?.[0].name || ''

            const authState = await AuthUtil.instance.getChatAuthState()

            if (authState.amazonQ !== 'connected') {
                await this.messenger.sendAuthNeededExceptionMessage(authState, data.tabID)
                session.isAuthenticating = true
                return
            }

            this.docGenerationTask.userIdentity = AuthUtil.instance.conn?.id

            const sendFolderConfirmationMessage = (message: string) => {
                this.messenger.sendFolderConfirmationMessage(
                    data.tabID,
                    message,
                    workspaceFolderName,
                    FolderSelectorFollowUps
                )
            }

            switch (data.followUp.type) {
                case FollowUpTypes.Retry:
                    if (this.mode === Mode.EDIT) {
                        this.enableUserInput(data?.tabID)
                    } else {
                        await this.tabOpened(data)
                    }
                    break
                case FollowUpTypes.NewTask:
                    this.messenger.sendAnswer({
                        type: 'answer',
                        tabID: data?.tabID,
                        message: i18n('AWS.amazonq.featureDev.answer.newTaskChanges'),
                        disableChatInput: true,
                    })
                    return this.newTask(data)
                case FollowUpTypes.CloseSession:
                    return this.closeSession(data)
                case FollowUpTypes.CreateDocumentation:
                    this.docGenerationTask.interactionType = 'GENERATE_README'
                    this.mode = Mode.CREATE
                    sendFolderConfirmationMessage(i18n('AWS.amazonq.doc.answer.createReadme'))
                    break
                case FollowUpTypes.ChooseFolder:
                    await this.folderSelector(data)
                    break
                case FollowUpTypes.SynchronizeDocumentation:
                    this.mode = Mode.SYNC
                    sendFolderConfirmationMessage(i18n('AWS.amazonq.doc.answer.updateReadme'))
                    break
                case FollowUpTypes.UpdateDocumentation:
                    this.docGenerationTask.interactionType = 'UPDATE_README'
                    this.messenger.sendAnswer({
                        type: 'answer',
                        tabID: data?.tabID,
                        followUps: [SynchronizeDocumentation, EditDocumentation],
                        disableChatInput: true,
                    })
                    break
                case FollowUpTypes.EditDocumentation:
                    this.docGenerationTask.interactionType = 'EDIT_README'
                    this.mode = Mode.EDIT
                    sendFolderConfirmationMessage(i18n('AWS.amazonq.doc.answer.updateReadme'))
                    break
                case FollowUpTypes.MakeChanges:
                    this.mode = Mode.EDIT
                    this.enableUserInput(data.tabID)
                    break
                case FollowUpTypes.AcceptChanges:
                    this.docGenerationTask.userDecision = 'ACCEPT'
                    await this.sendDocGenerationEvent(data)
                    await this.insertCode(data)
                    return
                case FollowUpTypes.RejectChanges:
                    this.docGenerationTask.userDecision = 'REJECT'
                    await this.sendDocGenerationEvent(data)
                    this.messenger.sendAnswer({
                        type: 'answer',
                        tabID: data?.tabID,
                        disableChatInput: true,
                        message: 'Your changes have been discarded.',
                        followUps: [
                            {
                                pillText: i18n('AWS.amazonq.featureDev.pillText.newTask'),
                                type: FollowUpTypes.NewTask,
                                status: 'info',
                            },
                            {
                                pillText: i18n('AWS.amazonq.doc.pillText.closeSession'),
                                type: FollowUpTypes.CloseSession,
                                status: 'info',
                            },
                        ],
                    })
                    break
                case FollowUpTypes.ProceedFolderSelection:
                    // If a user did not change the folder in a multi-root workspace, default to the first workspace folder
                    if (this.folderPath === '' && isMultiRootWorkspace()) {
                        this.folderPath = workspaceFolderName
                    }
                    if (this.mode === Mode.EDIT) {
                        this.enableUserInput(data.tabID)
                    } else {
                        await this.generateDocumentation({
                            message: {
                                ...data,
                                message:
                                    this.mode === Mode.CREATE
                                        ? 'Create documentation for a specific folder'
                                        : 'Sync documentation',
                            },
                            session,
                        })
                    }
                    break
                case FollowUpTypes.CancelFolderSelection:
                    this.docGenerationTask.reset()
                    return this.tabOpened(data)
            }
        })
    }

    private enableUserInput(tabID: string) {
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: tabID,
            message: i18n('AWS.amazonq.doc.answer.editReadme'),
        })
        this.messenger.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.doc.placeholder.editReadme'))
        this.messenger.sendChatInputEnabled(tabID, true)
    }

    private async fileClicked(message: any) {
        // TODO: add Telemetry here
        const tabId: string = message.tabID
        const messageId = message.messageId
        const filePathToUpdate: string = message.filePath

        const session = await this.sessionStorage.getSession(tabId)
        const filePathIndex = (session.state.filePaths ?? []).findIndex((obj) => obj.relativePath === filePathToUpdate)
        if (filePathIndex !== -1 && session.state.filePaths) {
            session.state.filePaths[filePathIndex].rejected = !session.state.filePaths[filePathIndex].rejected
        }
        const deletedFilePathIndex = (session.state.deletedFiles ?? []).findIndex(
            (obj) => obj.relativePath === filePathToUpdate
        )
        if (deletedFilePathIndex !== -1 && session.state.deletedFiles) {
            session.state.deletedFiles[deletedFilePathIndex].rejected =
                !session.state.deletedFiles[deletedFilePathIndex].rejected
        }

        await session.updateFilesPaths(
            tabId,
            session.state.filePaths ?? [],
            session.state.deletedFiles ?? [],
            messageId,
            true
        )
    }

    private async formActionClicked(message: any) {
        switch (message.action) {
            case 'cancel-doc-generation':
                // eslint-disable-next-line unicorn/no-null
                await this.stopResponse(message)

                break
        }
    }

    private async newTask(message: any) {
        // Old session for the tab is ending, delete it so we can create a new one for the message id
        this.docGenerationTask = new DocGenerationTask()
        const session = await this.sessionStorage.getSession(message.tabID)
        telemetry.amazonq_endChat.emit({
            amazonqConversationId: session.conversationId,
            amazonqEndOfTheConversationLatency: performance.now() - session.telemetry.sessionStartTime,
            result: 'Succeeded',
        })
        this.sessionStorage.deleteSession(message.tabID)

        // Re-run the opening flow, where we check auth + create a session
        await this.tabOpened(message)
    }

    private async closeSession(message: any) {
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: i18n('AWS.amazonq.featureDev.answer.sessionClosed'),
            disableChatInput: true,
        })
        this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.featureDev.placeholder.sessionClosed'))
        this.messenger.sendChatInputEnabled(message.tabID, false)

        const session = await this.sessionStorage.getSession(message.tabID)
        this.docGenerationTask.reset()

        telemetry.amazonq_endChat.emit({
            amazonqConversationId: session.conversationId,
            amazonqEndOfTheConversationLatency: performance.now() - session.telemetry.sessionStartTime,
            result: 'Succeeded',
        })
    }

    private processErrorChatMessage = (err: any, message: any, session: Session | undefined) => {
        const errorMessage = createUserFacingErrorMessage(`${err.cause?.message ?? err.message}`)
        // eslint-disable-next-line unicorn/no-null
        this.messenger.sendUpdatePromptProgress(message.tabID, null)

        switch (err.constructor.name) {
            case MonthlyConversationLimitError.name:
                this.messenger.sendMonthlyLimitError(message.tabID)
                break
            default:
                this.messenger.sendErrorMessage(errorMessage, message.tabID, 0, session?.conversationIdUnsafe, false)
        }
    }

    private async generateDocumentation({ message, session }: { message: any; session: any }) {
        try {
            await this.onDocsGeneration(session, message.message, message.tabID)
        } catch (err: any) {
            this.processErrorChatMessage(err, message, session)
            // Lock the chat input until they explicitly click one of the follow ups
            this.messenger.sendChatInputEnabled(message.tabID, false)
        }
    }

    private async processUserChatMessage(message: any) {
        if (message.message === undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID, 0, undefined)
            return
        }

        /**
         * Don't attempt to process any chat messages when a workspace folder is not set.
         * When the tab is first opened we will throw an error and lock the chat if the workspace
         * folder is not found
         */
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            return
        }

        const session: Session = await this.sessionStorage.getSession(message.tabID)

        try {
            getLogger().debug(`${featureName}: Processing message: ${message.message}`)

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                await this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }

            await this.generateDocumentation({ message, session })
            this.messenger.sendChatInputEnabled(message?.tabID, false)
            this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.doc.pillText.selectOption'))
        } catch (err: any) {
            this.processErrorChatMessage(err, message, session)
            // Lock the chat input until they explicitly click one of the follow ups
            this.messenger.sendChatInputEnabled(message.tabID, false)
        }
    }

    private async stopResponse(message: any) {
        telemetry.ui_click.emit({ elementId: 'amazonq_stopCodeGeneration' })
        this.messenger.sendAnswer({
            message: i18n('AWS.amazonq.featureDev.pillText.stoppingCodeGeneration'),
            type: 'answer-part',
            tabID: message.tabID,
        })
        // eslint-disable-next-line unicorn/no-null
        this.messenger.sendUpdatePromptProgress(message.tabID, null)
        this.messenger.sendChatInputEnabled(message.tabID, false)

        const session = await this.sessionStorage.getSession(message.tabID)
        session.state.tokenSource?.cancel()
    }

    private async tabOpened(message: any) {
        let session: Session | undefined
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            getLogger().debug(`${featureName}: Session created with id: ${session.tabID}`)
            this.folderPath = ''
            this.mode = Mode.NONE

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }
            this.docGenerationTask.numberOfNavigation += 1
            this.messenger.sendAnswer({
                type: 'answer',
                tabID: message.tabID,
                followUps: [
                    {
                        pillText: 'Create a README',
                        prompt: 'Create a README',
                        type: 'CreateDocumentation',
                    },
                    {
                        pillText: 'Update an existing README',
                        prompt: 'Update an existing README',
                        type: 'UpdateDocumentation',
                    },
                ],
                disableChatInput: true,
            })
            this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.doc.pillText.selectOption'))
        } catch (err: any) {
            if (err instanceof WorkspaceFolderNotFoundError) {
                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID: message.tabID,
                    message: err.message,
                    disableChatInput: true,
                })
            } else {
                this.messenger.sendErrorMessage(
                    createUserFacingErrorMessage(err.message),
                    message.tabID,
                    0,
                    session?.conversationIdUnsafe
                )
            }
        }
    }

    private async openMarkdownPreview(readmePath: vscode.Uri) {
        await vscode.commands.executeCommand('vscode.open', readmePath)
        await vscode.commands.executeCommand('markdown.showPreview')
    }

    private async onDocsGeneration(session: Session, message: string, tabID: string) {
        this.messenger.sendDocProgress(tabID, DocGenerationStep.UPLOAD_TO_S3, 0, this.mode)

        await session.preloader(message)

        try {
            await session.send(message, this.mode, this.folderPath)
            const filePaths = session.state.filePaths ?? []
            const deletedFiles = session.state.deletedFiles ?? []

            // Only add the follow up accept/deny buttons when the tab hasn't been closed/request hasn't been cancelled
            if (session?.state.tokenSource?.token.isCancellationRequested) {
                return
            }

            if (filePaths.length === 0 && deletedFiles.length === 0) {
                this.messenger.sendAnswer({
                    message: i18n('AWS.amazonq.featureDev.pillText.unableGenerateChanges'),
                    type: 'answer',
                    tabID: tabID,
                    canBeVoted: true,
                    disableChatInput: true,
                })

                return
            }

            this.messenger.sendCodeResult(
                filePaths,
                deletedFiles,
                session.state.references ?? [],
                tabID,
                session.uploadId,
                session.state.codeGenerationId ?? ''
            )

            // Automatically open the README diff
            const readmePath = findReadmePath(session.state.filePaths)
            if (readmePath) {
                await this.openDiff({ tabID, filePath: readmePath.zipFilePath })
            }

            const remainingIterations = session.state.codeGenerationRemainingIterationCount
            const totalIterations = session.state.codeGenerationTotalIterationCount

            if (remainingIterations !== undefined && totalIterations !== undefined) {
                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID: tabID,
                    message: `${this.mode === Mode.CREATE ? i18n('AWS.amazonq.doc.answer.readmeCreated') : i18n('AWS.amazonq.doc.answer.readmeUpdated')} ${i18n('AWS.amazonq.doc.answer.codeResult')}`,
                    disableChatInput: true,
                })
            }

            this.messenger.sendAnswer({
                message: undefined,
                type: 'system-prompt',
                disableChatInput: true,
                followUps: [
                    {
                        pillText: 'Accept',
                        prompt: 'Accept',
                        type: FollowUpTypes.AcceptChanges,
                        icon: 'ok' as MynahIcons,
                        status: 'success',
                    },
                    {
                        pillText: 'Make changes',
                        prompt: 'Make changes',
                        type: FollowUpTypes.MakeChanges,
                        icon: 'refresh' as MynahIcons,
                        status: 'info',
                    },
                    {
                        pillText: 'Reject',
                        prompt: 'Reject',
                        type: FollowUpTypes.RejectChanges,
                        icon: 'cancel' as MynahIcons,
                        status: 'error',
                    },
                ],
                tabID: tabID,
            })
        } finally {
            if (session?.state?.tokenSource?.token.isCancellationRequested) {
                await this.newTask({ tabID })
            } else {
                this.messenger.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.doc.pillText.selectOption'))

                this.messenger.sendChatInputEnabled(tabID, false)
            }
        }
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

    private tabClosed(message: any) {
        this.sessionStorage.deleteSession(message.tabID)
    }

    private async insertCode(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

            const acceptedFiles = (paths?: { rejected: boolean }[]) => (paths || []).filter((i) => !i.rejected).length

            const amazonqNumberOfFilesAccepted =
                acceptedFiles(session.state.filePaths) + acceptedFiles(session.state.deletedFiles)

            telemetry.amazonq_isAcceptedCodeChanges.emit({
                credentialStartUrl: AuthUtil.instance.startUrl,
                amazonqConversationId: session.conversationId,
                amazonqNumberOfFilesAccepted,
                enabled: true,
                result: 'Succeeded',
            })
            await session.insertChanges()

            const readmePath = findReadmePath(session.state.filePaths)
            if (readmePath) {
                await this.openMarkdownPreview(
                    vscode.Uri.file(path.join(readmePath.workspaceFolder.uri.fsPath, readmePath.relativePath))
                )
            }

            this.messenger.sendAnswer({
                type: 'answer',
                disableChatInput: true,
                tabID: message.tabID,
                followUps: [
                    {
                        pillText: 'Start a new documentation task',
                        prompt: 'Start a new documentation task',
                        type: FollowUpTypes.NewTask,
                        status: 'info',
                    },
                    {
                        pillText: 'End session',
                        prompt: 'End session',
                        type: FollowUpTypes.CloseSession,
                        status: 'info',
                    },
                ],
            })

            this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.doc.pillText.selectOption'))
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                createUserFacingErrorMessage(`Failed to insert code changes: ${err.message}`),
                message.tabID,
                0,
                session?.conversationIdUnsafe
            )
        }
    }
    private async sendDocGenerationEvent(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        this.docGenerationTask.conversationId = session.conversationId
        const { totalAddedChars, totalAddedLines, totalAddedFiles } = await session.countAddedContent(
            this.docGenerationTask.interactionType
        )
        this.docGenerationTask.numberOfAddChars = totalAddedChars
        this.docGenerationTask.numberOfAddLines = totalAddedLines
        this.docGenerationTask.numberOfAddFiles = totalAddedFiles
        const docGenerationEvent = this.docGenerationTask.docGenerationEventBase()

        await session.sendDocGenerationTelemetryEvent(docGenerationEvent)
    }
    private processLink(message: any) {
        void openUrl(vscode.Uri.parse(message.link))
    }
}
