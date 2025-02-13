/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for responding to UI events by calling
 * the Scan extension.
 */
import * as vscode from 'vscode'
import { AuthController } from 'aws-core-vscode/amazonq'
import { getLogger, placeholder, i18n, openUrl, fs, TabTypeDataMap, randomUUID } from 'aws-core-vscode/shared'
import { ScanChatControllerEventEmitters, Session, ChatSessionManager } from 'aws-core-vscode/amazonqScan'
import {
    AggregatedCodeScanIssue,
    AuthUtil,
    CodeAnalysisScope,
    codeScanState,
    isGitRepo,
    onDemandFileScanState,
    SecurityScanError,
    SecurityScanStep,
    showFileScan,
    showSecurityScan,
} from 'aws-core-vscode/codewhisperer'
import { Messenger, ScanNamedMessages } from './messenger/messenger'
import MessengerUtils from './messenger/messengerUtils'
import {
    cancellingProgressField,
    fileScanProgressField,
    projectScanProgressField,
    ScanAction,
    scanProgressMessage,
    scanSummaryMessage,
} from '../../models/constants'
import path from 'path'
import { telemetry } from 'aws-core-vscode/telemetry'

export class ScanController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionManager
    private authController: AuthController

    public constructor(
        private readonly chatControllerMessageListeners: ScanChatControllerEventEmitters,
        messenger: Messenger,
        onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.messenger = messenger
        this.sessionStorage = ChatSessionManager.Instance
        this.authController = new AuthController()

        this.chatControllerMessageListeners.tabOpened.event((data) => {
            return this.tabOpened(data).then(() => this.scanInitiated(data))
        })

        this.chatControllerMessageListeners.tabClosed.event((data) => {
            return this.tabClosed(data)
        })

        this.chatControllerMessageListeners.authClicked.event((data) => {
            this.authClicked(data)
        })

        this.chatControllerMessageListeners.formActionClicked.event((data) => {
            return this.formActionClicked(data)
        })

        this.chatControllerMessageListeners.errorThrown.event((data) => {
            return this.handleError(data)
        })

        this.chatControllerMessageListeners.showSecurityScan.event((data) => {
            return this.handleScanResults(data)
        })

        this.chatControllerMessageListeners.scanStopped.event((data) => {
            return this.handleScanStopped(data)
        })

        this.chatControllerMessageListeners.followUpClicked.event((data) => {
            return this.handleFollowUpClicked(data)
        })

        this.chatControllerMessageListeners.scanProgress.event((data) => {
            return this.handleScanProgress(data)
        })

        this.chatControllerMessageListeners.processResponseBodyLinkClick.event((data) => {
            return this.processLink(data)
        })

        this.chatControllerMessageListeners.fileClicked.event((data) => {
            return this.processFileClick(data)
        })

        this.chatControllerMessageListeners.scanCancelled.event((data) => {
            return this.handleScanCancelled(data)
        })

        this.chatControllerMessageListeners.processChatItemVotedMessage.event((data) => {
            telemetry.amazonq_feedback.emit({
                featureId: 'amazonQReview',
                amazonqConversationId: this.sessionStorage.getSession().scanUuid,
                credentialStartUrl: AuthUtil.instance.startUrl,
                interactionType: data.vote,
            })
        })
    }

    private async tabOpened(message: any) {
        const session: Session = this.sessionStorage.getSession()
        const tabID = this.sessionStorage.setActiveTab(message.tabID)

        // check if authentication has expired
        try {
            getLogger().debug(`Q - Review: Session created with id: ${session.tabID}`)

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

    private async scanInitiated(message: any) {
        const session: Session = this.sessionStorage.getSession()
        try {
            // check that a project is open
            const workspaceFolders = vscode.workspace.workspaceFolders
            if (workspaceFolders === undefined || workspaceFolders.length === 0) {
                this.messenger.sendChatInputEnabled(message.tabID, false)
                this.messenger.sendErrorResponse('no-project-found', message.tabID)
                return
            }
            // check that the session is authenticated
            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }
            this.messenger.sendPromptMessage({
                tabID: message.tabID,
                message: i18n('AWS.amazonq.scans.runCodeScan'),
            })
            this.messenger.sendCapabilityCard({ tabID: message.tabID })
            // Displaying types of scans and wait for user input
            this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.scans.waitingForInput'))

            this.messenger.sendScans(message.tabID, i18n('AWS.amazonq.scans.chooseScan.description'))
        } catch (e: any) {
            this.messenger.sendErrorMessage(e.message, message.tabID)
        }
    }

    private async formActionClicked(message: any) {
        const typedAction = MessengerUtils.stringToEnumValue(ScanAction, message.action as any)
        switch (typedAction) {
            case ScanAction.STOP_PROJECT_SCAN:
                codeScanState.setToCancelling()
                this.messenger.sendUpdatePromptProgress(message.tabID, cancellingProgressField)
                break
            case ScanAction.STOP_FILE_SCAN:
                onDemandFileScanState.setToCancelling()
                this.messenger.sendUpdatePromptProgress(message.tabID, cancellingProgressField)
                break
        }
    }

    private async handleError(message: {
        error: SecurityScanError
        tabID: string
        scope: CodeAnalysisScope
        fileName: string | undefined
        scanUuid?: string
    }) {
        if (this.isNotMatchingId(message)) {
            return
        }
        if (message.error.code === 'NoSourceFilesError') {
            this.messenger.sendScanResults(message.tabID, message.scope, message.fileName, true)
            this.messenger.sendAnswer({
                tabID: message.tabID,
                type: 'answer',
                canBeVoted: true,
                message: scanSummaryMessage(message.scope, []),
            })
        } else {
            this.messenger.sendErrorResponse(message.error, message.tabID)
        }
    }

    private async handleScanResults(message: {
        error: Error
        totalIssues: number
        tabID: string
        securityRecommendationCollection: AggregatedCodeScanIssue[]
        scope: CodeAnalysisScope
        fileName: string
        scanUuid?: string
    }) {
        if (this.isNotMatchingId(message)) {
            return
        }
        this.messenger.sendScanResults(message.tabID, message.scope, message.fileName, true)
        this.messenger.sendAnswer({
            tabID: message.tabID,
            type: 'answer',
            canBeVoted: true,
            message: scanSummaryMessage(message.scope, message.securityRecommendationCollection),
        })
    }

    private async handleScanStopped(message: { tabID: string }) {
        this.messenger.sendUpdatePlaceholder(message.tabID, TabTypeDataMap.review.placeholder)
        // eslint-disable-next-line unicorn/no-null
        this.messenger.sendUpdatePromptProgress(message.tabID, null)
        this.messenger.sendChatInputEnabled(message.tabID, true)
    }

    private async handleFollowUpClicked(message: any) {
        switch (message.followUp.type) {
            case ScanAction.RUN_PROJECT_SCAN: {
                this.messenger.sendPromptMessage({
                    tabID: message.tabID,
                    message: i18n('AWS.amazonq.scans.projectScan'),
                })

                const workspaceFolders = vscode.workspace.workspaceFolders ?? []
                for (const folder of workspaceFolders) {
                    if (!(await isGitRepo(folder.uri))) {
                        this.messenger.sendAnswer({
                            tabID: message.tabID,
                            type: 'answer',
                            message: i18n('AWS.amazonq.scans.noGitRepo'),
                        })
                        break
                    }
                }

                this.messenger.sendScanInProgress({
                    type: 'answer-stream',
                    tabID: message.tabID,
                    canBeVoted: true,
                    message: scanProgressMessage(0, CodeAnalysisScope.PROJECT),
                })
                this.messenger.sendUpdatePromptProgress(message.tabID, projectScanProgressField)
                const scanUuid = randomUUID()
                this.sessionStorage.getSession().scanUuid = scanUuid
                void showSecurityScan.execute(placeholder, 'amazonQChat', true, scanUuid)
                break
            }
            case ScanAction.RUN_FILE_SCAN: {
                // check if IDE has active file open.
                const activeEditor = vscode.window.activeTextEditor
                // also check all open editors and allow this to proceed if only one is open (even if not main focus)
                const allVisibleEditors = vscode.window.visibleTextEditors
                const openFileEditors = allVisibleEditors.filter((editor) => editor.document.uri.scheme === 'file')
                const hasOnlyOneOpenFileSplitView = openFileEditors.length === 1
                getLogger().debug(`hasOnlyOneOpenSplitView: ${hasOnlyOneOpenFileSplitView}`)
                // is not a file if the currently highlighted window is not a file, and there is either more than one or no file windows open
                const isNotFile = activeEditor?.document.uri.scheme !== 'file' && !hasOnlyOneOpenFileSplitView
                getLogger().debug(`activeEditor: ${activeEditor}, isNotFile: ${isNotFile}`)
                if (!activeEditor || isNotFile) {
                    this.messenger.sendErrorResponse(
                        isNotFile ? 'invalid-file-type' : 'no-open-file-found',
                        message.tabID
                    )
                    this.messenger.sendUpdatePlaceholder(
                        message.tabID,
                        'Please open and highlight a source code file in order run a code scan.'
                    )
                    this.messenger.sendChatInputEnabled(message.tabID, true)
                    return
                }
                const fileEditorToTest = hasOnlyOneOpenFileSplitView ? openFileEditors[0] : activeEditor
                const fileName = fileEditorToTest.document.uri.fsPath

                this.messenger.sendPromptMessage({
                    tabID: message.tabID,
                    message: i18n('AWS.amazonq.scans.fileScan'),
                })
                this.messenger.sendScanInProgress({
                    type: 'answer-stream',
                    tabID: message.tabID,
                    canBeVoted: true,
                    message: scanProgressMessage(
                        SecurityScanStep.GENERATE_ZIP - 1,
                        CodeAnalysisScope.FILE_ON_DEMAND,
                        fileName ? path.basename(fileName) : undefined
                    ),
                })
                this.messenger.sendUpdatePromptProgress(message.tabID, fileScanProgressField)
                const scanUuid = randomUUID()
                this.sessionStorage.getSession().scanUuid = scanUuid
                void showFileScan.execute(placeholder, 'amazonQChat', scanUuid)
                break
            }
        }
    }

    private async handleScanProgress(message: any) {
        if (this.isNotMatchingId(message)) {
            return
        }
        this.messenger.sendAnswer({
            type: 'answer-part',
            tabID: message.tabID,
            messageID: ScanNamedMessages.SCAN_SUBMISSION_STATUS_MESSAGE,
            message: scanProgressMessage(
                message.step,
                message.scope,
                message.fileName ? path.basename(message.fileName) : undefined
            ),
        })
    }

    private processLink(message: any) {
        void openUrl(vscode.Uri.parse(message.link))
    }

    private async processFileClick(message: any) {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? []
        for (const workspaceFolder of workspaceFolders) {
            const projectPath = workspaceFolder.uri.fsPath
            const filePathWithoutProjectName = message.filePath.split('/').slice(1).join('/')
            const absolutePath = path.join(projectPath, filePathWithoutProjectName)
            if (await fs.existsFile(absolutePath)) {
                const document = await vscode.workspace.openTextDocument(absolutePath)
                await vscode.window.showTextDocument(document)
            }
        }
    }

    private async handleScanCancelled(message: any) {
        this.messenger.sendAnswer({ type: 'answer', tabID: message.tabID, message: 'Cancelled' })
    }

    private isNotMatchingId(data: { scanUuid?: string }): boolean {
        const messagescanUuid = data.scanUuid
        const currentscanUuid = this.sessionStorage.getSession().scanUuid
        return Boolean(messagescanUuid) && Boolean(currentscanUuid) && messagescanUuid !== currentscanUuid
    }
}
