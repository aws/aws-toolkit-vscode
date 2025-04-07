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
    NewSessionFollowUps,
    SynchronizeDocumentation,
    CodeChangeFollowUps,
    docScheme,
    featureName,
    findReadmePath,
} from '../../constants'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getLogger } from '../../../shared/logger/logger'

import { Session } from '../../session/session'
import { i18n } from '../../../shared/i18n-helper'
import path from 'path'
import { createSingleFileDialog } from '../../../shared/ui/common/openDialog'

import {
    MonthlyConversationLimitError,
    SelectedFolderNotInWorkspaceFolderError,
    WorkspaceFolderNotFoundError,
    createUserFacingErrorMessage,
    getMetricResult,
} from '../../../amazonqFeatureDev/errors'
import { BaseChatSessionStorage } from '../../../amazonq/commons/baseChatStorage'
import { DocMessenger } from '../../messenger'
import { AuthController } from '../../../amazonq/auth/controller'
import { openUrl } from '../../../shared/utilities/vsCodeUtils'
import { createAmazonQUri, openDeletedDiff, openDiff } from '../../../amazonq/commons/diff'
import {
    getWorkspaceFoldersByPrefixes,
    getWorkspaceRelativePath,
    isMultiRootWorkspace,
} from '../../../shared/utilities/workspaceUtils'
import { getPathsFromZipFilePath, SvgFileExtension } from '../../../amazonq/util/files'
import { FollowUpTypes } from '../../../amazonq/commons/types'
import { DocGenerationTask, DocGenerationTasks } from '../docGenerationTask'
import { normalize } from '../../../shared/utilities/pathUtils'
import { DevPhase, MetricDataOperationName, MetricDataResult } from '../../types'

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
    private docGenerationTasks: DocGenerationTasks

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: DocMessenger,
        sessionStorage: BaseChatSessionStorage<Session>,
        _onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.messenger = messenger
        this.sessionStorage = sessionStorage
        this.authController = new AuthController()
        this.docGenerationTasks = new DocGenerationTasks()

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
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(() => {
            this.sessionStorage.deleteAllSessions()
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
            const docGenerationTask = this.docGenerationTasks.getTask(data.tabID)
            if (relativePath) {
                // Display path should always include workspace folder name
                displayPath = path.join(relativePath.workspaceFolder.name, relativePath.relativePath)
                // Only include workspace folder name in API call if multi-root workspace
                docGenerationTask.folderPath = normalize(
                    isMultiRootWorkspace() ? displayPath : relativePath.relativePath
                )

                if (!relativePath.relativePath) {
                    docGenerationTask.folderLevel = 'ENTIRE_WORKSPACE'
                } else {
                    docGenerationTask.folderLevel = 'SUB_FOLDER'
                }
            }

            this.messenger.sendFolderConfirmationMessage(
                data.tabID,
                docGenerationTask.mode === Mode.CREATE
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
                if (rightPath.toLowerCase().endsWith(SvgFileExtension)) {
                    const rightPathUri = createAmazonQUri(rightPath, tabId, this.scheme)
                    const infraDiagramContent = await vscode.workspace.openTextDocument(rightPathUri)
                    await vscode.window.showTextDocument(infraDiagramContent)
                } else {
                    await openDiff(pathInfos.absolutePath, rightPath, tabId, this.scheme)
                }
            }
        }
    }

    private initializeFollowUps(): void {
        this.chatControllerMessageListeners.followUpClicked.event(async (data) => {
            const session: Session = await this.sessionStorage.getSession(data.tabID)
            const docGenerationTask = this.docGenerationTasks.getTask(data.tabID)

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
                    if (docGenerationTask.mode === Mode.EDIT) {
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
                    docGenerationTask.interactionType = 'GENERATE_README'
                    docGenerationTask.mode = Mode.CREATE
                    sendFolderConfirmationMessage(i18n('AWS.amazonq.doc.answer.createReadme'))
                    break
                case FollowUpTypes.ChooseFolder:
                    await this.folderSelector(data)
                    break
                case FollowUpTypes.SynchronizeDocumentation:
                    docGenerationTask.mode = Mode.SYNC
                    sendFolderConfirmationMessage(i18n('AWS.amazonq.doc.answer.updateReadme'))
                    break
                case FollowUpTypes.UpdateDocumentation:
                    docGenerationTask.interactionType = 'UPDATE_README'
                    this.messenger.sendAnswer({
                        type: 'answer',
                        tabID: data?.tabID,
                        followUps: [SynchronizeDocumentation, EditDocumentation],
                        disableChatInput: true,
                    })
                    break
                case FollowUpTypes.EditDocumentation:
                    docGenerationTask.interactionType = 'EDIT_README'
                    docGenerationTask.mode = Mode.EDIT
                    sendFolderConfirmationMessage(i18n('AWS.amazonq.doc.answer.updateReadme'))
                    break
                case FollowUpTypes.MakeChanges:
                    docGenerationTask.mode = Mode.EDIT
                    this.enableUserInput(data.tabID)
                    break
                case FollowUpTypes.AcceptChanges:
                    docGenerationTask.userDecision = 'ACCEPT'
                    await this.sendDocAcceptanceEvent(data)
                    await this.insertCode(data)
                    return
                case FollowUpTypes.RejectChanges:
                    docGenerationTask.userDecision = 'REJECT'
                    await this.sendDocAcceptanceEvent(data)
                    this.messenger.sendAnswer({
                        type: 'answer',
                        tabID: data?.tabID,
                        disableChatInput: true,
                        message: 'Your changes have been discarded.',
                        followUps: NewSessionFollowUps,
                    })
                    break
                case FollowUpTypes.ProceedFolderSelection:
                    // If a user did not change the folder in a multi-root workspace, default to the first workspace folder
                    if (docGenerationTask.folderPath === '' && isMultiRootWorkspace()) {
                        docGenerationTask.folderPath = workspaceFolderName
                    }
                    if (docGenerationTask.mode === Mode.EDIT) {
                        this.enableUserInput(data.tabID)
                    } else {
                        await this.generateDocumentation(
                            {
                                ...data,
                                message:
                                    docGenerationTask.mode === Mode.CREATE
                                        ? 'Create documentation for a specific folder'
                                        : 'Sync documentation',
                            },
                            session,
                            docGenerationTask
                        )
                    }
                    break
                case FollowUpTypes.CancelFolderSelection:
                    docGenerationTask.reset()
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

        this.docGenerationTasks.deleteTask(message.tabID)
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
        this.docGenerationTasks.deleteTask(message.tabID)
    }

    private processErrorChatMessage = (
        err: any,
        message: any,
        session: Session | undefined,
        docGenerationTask: DocGenerationTask
    ) => {
        const errorMessage = createUserFacingErrorMessage(`${err.cause?.message ?? err.message}`)
        // eslint-disable-next-line unicorn/no-null
        this.messenger.sendUpdatePromptProgress(message.tabID, null)
        if (err.constructor.name === MonthlyConversationLimitError.name) {
            this.messenger.sendMonthlyLimitError(message.tabID)
        } else {
            const enableUserInput = docGenerationTask.mode === Mode.EDIT && err.remainingIterations > 0

            this.messenger.sendErrorMessage(
                errorMessage,
                message.tabID,
                0,
                session?.conversationIdUnsafe,
                false,
                enableUserInput
            )
        }
    }

    private async generateDocumentation(message: any, session: any, docGenerationTask: DocGenerationTask) {
        try {
            await this.onDocsGeneration(session, message.message, message.tabID, docGenerationTask)
        } catch (err: any) {
            this.processErrorChatMessage(err, message, session, docGenerationTask)
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
        const docGenerationTask = this.docGenerationTasks.getTask(message.tabID)

        try {
            getLogger().debug(`${featureName}: Processing message: ${message.message}`)

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                await this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }

            await this.generateDocumentation(message, session, docGenerationTask)
        } catch (err: any) {
            this.processErrorChatMessage(err, message, session, docGenerationTask)
        }
    }

    private async stopResponse(message: any) {
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
            const docGenerationTask = this.docGenerationTasks.getTask(message.tabID)
            getLogger().debug(`${featureName}: Session created with id: ${session.tabID}`)
            docGenerationTask.folderPath = ''
            docGenerationTask.mode = Mode.NONE

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }
            docGenerationTask.numberOfNavigations += 1
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

    private async onDocsGeneration(
        session: Session,
        message: string,
        tabID: string,
        docGenerationTask: DocGenerationTask
    ) {
        this.messenger.sendDocProgress(tabID, DocGenerationStep.UPLOAD_TO_S3, 0, docGenerationTask.mode)

        await session.preloader(message)

        try {
            await session.sendDocMetricData(MetricDataOperationName.StartDocGeneration, MetricDataResult.Success)
            await session.send(message, docGenerationTask.mode, docGenerationTask.folderPath)
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
                    message: `${docGenerationTask.mode === Mode.CREATE ? i18n('AWS.amazonq.doc.answer.readmeCreated') : i18n('AWS.amazonq.doc.answer.readmeUpdated')} ${remainingIterations > 0 ? i18n('AWS.amazonq.doc.answer.codeResult') : i18n('AWS.amazonq.doc.answer.acceptOrReject')}`,
                    disableChatInput: true,
                })

                this.messenger.sendAnswer({
                    message: undefined,
                    type: 'system-prompt',
                    disableChatInput: true,
                    followUps:
                        remainingIterations > 0
                            ? CodeChangeFollowUps
                            : CodeChangeFollowUps.filter((followUp) => followUp.type !== FollowUpTypes.MakeChanges),
                    tabID: tabID,
                })
            }
            if (session?.state.phase === DevPhase.CODEGEN) {
                const docGenerationTask = this.docGenerationTasks.getTask(tabID)
                const { totalGeneratedChars, totalGeneratedLines, totalGeneratedFiles } =
                    await session.countGeneratedContent(docGenerationTask.interactionType)
                docGenerationTask.conversationId = session.conversationId
                docGenerationTask.numberOfGeneratedChars = totalGeneratedChars
                docGenerationTask.numberOfGeneratedLines = totalGeneratedLines
                docGenerationTask.numberOfGeneratedFiles = totalGeneratedFiles
                const docGenerationEvent = docGenerationTask.docGenerationEventBase()

                await session.sendDocTelemetryEvent(docGenerationEvent, 'generation')
            }
        } catch (err: any) {
            getLogger().error(`${featureName}: Error during doc generation: ${err}`)
            await session.sendDocMetricData(MetricDataOperationName.EndDocGeneration, getMetricResult(err))
            throw err
        } finally {
            if (session?.state?.tokenSource?.token.isCancellationRequested) {
                await this.newTask({ tabID })
            } else {
                this.messenger.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.doc.pillText.selectOption'))

                this.messenger.sendChatInputEnabled(tabID, false)
            }
        }
        await session.sendDocMetricData(MetricDataOperationName.EndDocGeneration, MetricDataResult.Success)
    }

    private authClicked(message: any) {
        this.authController.handleAuth(message.authType)

        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: 'Follow instructions to re-authenticate ...',
            disableChatInput: true,
        })
    }

    private tabClosed(message: any) {
        this.sessionStorage.deleteSession(message.tabID)
        this.docGenerationTasks.deleteTask(message.tabID)
    }

    private async insertCode(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

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
                followUps: NewSessionFollowUps,
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
    private async sendDocAcceptanceEvent(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        const docGenerationTask = this.docGenerationTasks.getTask(message.tabID)
        docGenerationTask.conversationId = session.conversationId
        const { totalAddedChars, totalAddedLines, totalAddedFiles } = await session.countAddedContent(
            docGenerationTask.interactionType
        )
        docGenerationTask.numberOfAddedChars = totalAddedChars
        docGenerationTask.numberOfAddedLines = totalAddedLines
        docGenerationTask.numberOfAddedFiles = totalAddedFiles
        const docAcceptanceEvent = docGenerationTask.docAcceptanceEventBase()

        await session.sendDocTelemetryEvent(docAcceptanceEvent, 'acceptance')
    }
    private processLink(message: any) {
        void openUrl(vscode.Uri.parse(message.link))
    }
}
