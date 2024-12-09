/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for responding to UI events by calling
 * the Test extension.
 */
import * as vscode from 'vscode'
import path from 'path'
import { FollowUps, Messenger, TestNamedMessages } from './messenger/messenger'
import { AuthController } from '../../../amazonq/auth/controller'
import { ChatSessionManager } from '../storages/chatSession'
import { BuildStatus, ConversationState, Session } from '../session/session'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import {
    CodeWhispererConstants,
    ReferenceLogViewProvider,
    ShortAnswer,
    ShortAnswerReference,
    TelemetryHelper,
    TestGenerationBuildStep,
    testGenState,
    unitTestGenerationCancelMessage,
} from '../../../codewhisperer'
import {
    fs,
    getLogger,
    getTelemetryReasonDesc,
    i18n,
    openUrl,
    randomUUID,
    sleep,
    tempDirPath,
    testGenerationLogsDir,
} from '../../../shared'
import {
    buildProgressField,
    cancellingProgressField,
    cancelTestGenButton,
    errorProgressField,
    testGenBuildProgressMessage,
    testGenCompletedField,
    testGenProgressField,
    testGenSummaryMessage,
} from '../../models/constants'
import MessengerUtils, { ButtonActions } from './messenger/messengerUtils'
import { isAwsError } from '../../../shared/errors'
import { ChatItemType } from '../../../amazonq/commons/model'
import { ProgressField } from '@aws/mynah-ui'
import { FollowUpTypes } from '../../../amazonq/commons/types'
import {
    cancelBuild,
    runBuildCommand,
    startTestGenerationProcess,
} from '../../../codewhisperer/commands/startTestGeneration'
import { UserIntent } from '@amzn/codewhisperer-streaming'
import { getSelectedCustomization } from '../../../codewhisperer/util/customizationUtil'
import { createCodeWhispererChatStreamingClient } from '../../../shared/clients/codewhispererChatClient'
import { ChatTriggerType } from '../../../codewhispererChat/controllers/chat/model'
import { triggerPayloadToChatRequest } from '../../../codewhispererChat/controllers/chat/chatRequest/converter'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'
import { amazonQTabSuffix } from '../../../shared/constants'
import { applyChanges } from '../../../shared/utilities/textDocumentUtilities'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { CodeReference } from '../../../amazonq'
import { CodeWhispererSettings } from '../../../codewhisperer/util/codewhispererSettings'

export interface TestChatControllerEventEmitters {
    readonly tabOpened: vscode.EventEmitter<any>
    readonly tabClosed: vscode.EventEmitter<any>
    readonly authClicked: vscode.EventEmitter<any>
    readonly startTestGen: vscode.EventEmitter<any>
    readonly processHumanChatMessage: vscode.EventEmitter<any>
    readonly updateShortAnswer: vscode.EventEmitter<any>
    readonly showCodeGenerationResults: vscode.EventEmitter<any>
    readonly openDiff: vscode.EventEmitter<any>
    readonly formActionClicked: vscode.EventEmitter<any>
    readonly followUpClicked: vscode.EventEmitter<any>
    readonly sendUpdatePromptProgress: vscode.EventEmitter<any>
    readonly errorThrown: vscode.EventEmitter<any>
    readonly insertCodeAtCursorPosition: vscode.EventEmitter<any>
    readonly processResponseBodyLinkClick: vscode.EventEmitter<any>
}

type OpenDiffMessage = {
    tabID: string
    messageId: string
    filePath: string
    codeGenerationId: string
}

export class TestController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionManager
    private authController: AuthController
    private readonly editorContentController: EditorContentController
    tempResultDirPath = path.join(tempDirPath, 'q-testgen')

    public constructor(
        private readonly chatControllerMessageListeners: TestChatControllerEventEmitters,
        messenger: Messenger,
        onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.messenger = messenger
        this.sessionStorage = ChatSessionManager.Instance
        this.authController = new AuthController()
        this.editorContentController = new EditorContentController()

        this.chatControllerMessageListeners.tabOpened.event((data) => {
            return this.tabOpened(data)
        })

        this.chatControllerMessageListeners.tabClosed.event((data) => {
            return this.tabClosed(data)
        })

        this.chatControllerMessageListeners.authClicked.event((data) => {
            this.authClicked(data)
        })

        this.chatControllerMessageListeners.startTestGen.event(async (data) => {
            await this.startTestGen(data, false)
        })

        this.chatControllerMessageListeners.processHumanChatMessage.event((data) => {
            return this.processHumanChatMessage(data)
        })

        this.chatControllerMessageListeners.formActionClicked.event((data) => {
            return this.handleFormActionClicked(data)
        })

        this.chatControllerMessageListeners.updateShortAnswer.event((data) => {
            return this.updateShortAnswer(data)
        })

        this.chatControllerMessageListeners.showCodeGenerationResults.event((data) => {
            return this.showCodeGenerationResults(data)
        })

        this.chatControllerMessageListeners.openDiff.event((data) => {
            return this.openDiff(data)
        })

        this.chatControllerMessageListeners.sendUpdatePromptProgress.event((data) => {
            return this.handleUpdatePromptProgress(data)
        })

        this.chatControllerMessageListeners.errorThrown.event((data) => {
            return this.handleErrorMessage(data)
        })

        this.chatControllerMessageListeners.insertCodeAtCursorPosition.event((data) => {
            return this.handleInsertCodeAtCursorPosition(data)
        })

        this.chatControllerMessageListeners.processResponseBodyLinkClick.event((data) => {
            return this.processLink(data)
        })

        this.chatControllerMessageListeners.followUpClicked.event((data) => {
            switch (data.followUp.type) {
                case FollowUpTypes.ViewDiff:
                    return this.openDiff(data)
                case FollowUpTypes.AcceptCode:
                    return this.acceptCode(data)
                case FollowUpTypes.RejectCode:
                    return this.endSession(data, FollowUpTypes.RejectCode)
                case FollowUpTypes.ContinueBuildAndExecute:
                    return this.handleBuildIteration(data)
                case FollowUpTypes.BuildAndExecute:
                    return this.checkForInstallationDependencies(data)
                case FollowUpTypes.ModifyCommands:
                    return this.modifyBuildCommand(data)
                case FollowUpTypes.SkipBuildAndFinish:
                    return this.endSession(data, FollowUpTypes.SkipBuildAndFinish)
                case FollowUpTypes.InstallDependenciesAndContinue:
                    return this.handleInstallDependencies(data)
                case FollowUpTypes.ViewCodeDiffAfterIteration:
                    return this.openDiff(data)
            }
        })
    }

    /**
     * Basic Functions
     */
    private async tabOpened(message: any) {
        const session: Session = this.sessionStorage.getSession()
        const tabID = this.sessionStorage.setActiveTab(message.tabID)
        const logger = getLogger()
        logger.debug('Tab opened Processing message tabId: %s', message.tabID)

        // check if authentication has expired
        try {
            logger.debug(`Q - Test: Session created with id: ${session.tabID}`)

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, tabID)
                session.isAuthenticating = true
                return
            }
        } catch (err: any) {
            logger.error('tabOpened failed: %O', err)
            this.messenger.sendErrorMessage(err.message, message.tabID)
        }
    }

    private async tabClosed(data: any) {
        getLogger().debug('Tab closed with data tab id: %s', data.tabID)
        await this.sessionCleanUp()
        getLogger().debug('Removing active tab')
        this.sessionStorage.removeActiveTab()
    }

    private authClicked(message: any) {
        this.authController.handleAuth(message.authType)

        this.messenger.sendMessage('Follow instructions to re-authenticate ...', message.tabID, 'answer')

        // Explicitly ensure the user goes through the re-authenticate flow
        this.messenger.sendChatInputEnabled(message.tabID, false)
    }

    private processLink(message: any) {
        void openUrl(vscode.Uri.parse(message.link))
    }

    private handleInsertCodeAtCursorPosition(message: any) {
        this.editorContentController.insertTextAtCursorPosition(message.code, () => {})
    }

    private checkCodeDiffLengthAndBuildStatus(state: { codeDiffLength: number; buildStatus: BuildStatus }): boolean {
        return state.codeDiffLength !== 0 && state.buildStatus !== BuildStatus.SUCCESS
    }

    // Displaying error message to the user in the chat tab
    private async handleErrorMessage(data: any) {
        testGenState.setToNotStarted()
        // eslint-disable-next-line unicorn/no-null
        this.messenger.sendUpdatePromptProgress(data.tabID, null)
        const session = this.sessionStorage.getSession()
        const isCancel = data.error.message === unitTestGenerationCancelMessage
        telemetry.amazonq_utgGenerateTests.emit({
            cwsprChatProgrammingLanguage: session.fileLanguage ?? 'plaintext',
            jobId: session.listOfTestGenerationJobId[0], // For RIV, UTG does only one StartTestGeneration API call
            jobGroup: session.testGenerationJobGroupName,
            requestId: session.startTestGenerationRequestId,
            hasUserPromptSupplied: session.hasUserPromptSupplied,
            isCodeBlockSelected: session.isCodeBlockSelected,
            buildPayloadBytes: session.srcPayloadSize,
            buildZipFileBytes: session.srcZipFileSize,
            artifactsUploadDuration: session.artifactsUploadDuration,
            perfClientLatency: performance.now() - session.testGenerationStartTime,
            result: isCancel ? 'Cancelled' : 'Failed',
            reasonDesc: getTelemetryReasonDesc(data.error),
            isSupportedLanguage: true,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
        if (session.stopIteration) {
            // Error from Science
            this.messenger.sendMessage(data.error.message.replaceAll('```', ''), data.tabID, 'answer')
        } else {
            isCancel
                ? this.messenger.sendMessage(data.error.message, data.tabID, 'answer')
                : this.sendErrorMessage(data)
        }
        await this.sessionCleanUp()
        return
    }
    // Client side error messages
    private sendErrorMessage(data: { tabID: string; error: { code: string; message: string } }) {
        const { error, tabID } = data

        if (isAwsError(error)) {
            if (error.code === 'ThrottlingException') {
                // TODO: use the explicitly modeled exception reason for quota vs throttle
                if (error.message.includes(CodeWhispererConstants.utgLimitReached)) {
                    getLogger().error('Monthly quota reached for QSDA actions.')
                    return this.messenger.sendMessage(
                        i18n('AWS.amazonq.featureDev.error.monthlyLimitReached'),
                        tabID,
                        'answer'
                    )
                } else {
                    getLogger().error('Too many requests.')
                    // TODO: move to constants file
                    this.messenger.sendErrorMessage('Too many requests. Please wait before retrying.', tabID)
                }
            } else {
                // other service errors:
                // AccessDeniedException - should not happen because access is validated before this point in the client
                // ValidationException - shouldn't happen because client should not send malformed requests
                // ConflictException - should not happen because the client will maintain proper state
                // InternalServerException - shouldn't happen but needs to be caught
                getLogger().error('Other error message: %s', error.message)
                this.messenger.sendErrorMessage(
                    'Encountered an unexpected error when generating tests. Please try again',
                    tabID
                )
            }
        } else {
            // other unexpected errors (TODO enumerate all other failure cases)
            getLogger().error('Other error message: %s', error.message)
            this.messenger.sendErrorMessage(
                'Encountered an unexpected error when generating tests. Please try again',
                tabID
            )
        }
    }

    // This function handles actions if user clicked on any Button one of these cases will be executed
    private async handleFormActionClicked(data: any) {
        const typedAction = MessengerUtils.stringToEnumValue(ButtonActions, data.action as any)
        switch (typedAction) {
            case ButtonActions.STOP_TEST_GEN:
                testGenState.setToCancelling()
                telemetry.ui_click.emit({ elementId: 'unitTestGeneration_cancelTestGenerationProgress' })
                await this.sessionCleanUp()
                break
            case ButtonActions.STOP_BUILD:
                cancelBuild()
                void this.handleUpdatePromptProgress({ status: 'cancel', tabID: data.tabID })
                telemetry.ui_click.emit({ elementId: 'unitTestGeneration_cancelBuildProgress' })
                this.messenger.sendChatInputEnabled(data.tabID, true)
                await this.sessionCleanUp()
                break
        }
    }
    // This function handles actions if user gives any input from the chatInput box
    private async processHumanChatMessage(data: { prompt: string; tabID: string }) {
        const session = this.sessionStorage.getSession()
        const conversationState = session.conversationState

        if (conversationState === ConversationState.WAITING_FOR_BUILD_COMMMAND_INPUT) {
            this.messenger.sendChatInputEnabled(data.tabID, false)
            this.sessionStorage.getSession().conversationState = ConversationState.IDLE
            session.updatedBuildCommands = [data.prompt]
            const updatedCommands = session.updatedBuildCommands.join('\n')
            this.messenger.sendMessage(`Updated command to \`${updatedCommands}\``, data.tabID, 'prompt')
            await this.checkForInstallationDependencies(data)
            return
        } else {
            await this.startTestGen(data, false)
        }
    }
    // This function takes filePath as input parameter and returns file language
    private async getLanguageForFilePath(filePath: string): Promise<string> {
        try {
            const document = await vscode.workspace.openTextDocument(filePath)
            return document.languageId
        } catch (error) {
            return 'plaintext'
        }
    }

    /**
     * Start Test Generation and show the code results
     */

    private async startTestGen(message: any, regenerateTests: boolean) {
        const session: Session = this.sessionStorage.getSession()
        const tabID = this.sessionStorage.setActiveTab(message.tabID)
        getLogger().debug('startTestGen message: %O', message)
        getLogger().debug('startTestGen tabId: %O', message.tabID)
        let fileName = ''
        let filePath = ''
        let userMessage = ''
        session.testGenerationStartTime = performance.now()

        try {
            if (ChatSessionManager.Instance.getIsInProgress()) {
                void vscode.window.showInformationMessage(
                    "There is already a test generation job in progress. Cancel current job or wait until it's finished to try again."
                )
                return
            }
            if (testGenState.isCancelling()) {
                void vscode.window.showInformationMessage(
                    'There is a test generation job being cancelled. Please wait for cancellation to finish.'
                )
                return
            }

            // check that the session is authenticated
            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, tabID)
                session.isAuthenticating = true
                return
            }

            // check that a project/workspace is open
            const workspaceFolders = vscode.workspace.workspaceFolders
            if (workspaceFolders === undefined || workspaceFolders.length === 0) {
                this.messenger.sendUnrecoverableErrorResponse('no-project-found', tabID)
                return
            }

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
                this.messenger.sendUnrecoverableErrorResponse(
                    isNotFile ? 'invalid-file-type' : 'no-open-file-found',
                    tabID
                )
                this.messenger.sendUpdatePlaceholder(
                    tabID,
                    'Please open and highlight a source code file in order to generate tests.'
                )
                this.messenger.sendChatInputEnabled(tabID, true)
                this.sessionStorage.getSession().conversationState = ConversationState.WAITING_FOR_INPUT
                return
            }

            const fileEditorToTest = hasOnlyOneOpenFileSplitView ? openFileEditors[0] : activeEditor
            getLogger().debug(`File path: ${fileEditorToTest.document.uri.fsPath}`)
            filePath = fileEditorToTest.document.uri.fsPath
            fileName = path.basename(filePath)
            userMessage = message.prompt
                ? regenerateTests
                    ? `${message.prompt}`
                    : `/test ${message.prompt}`
                : `/test Generate unit tests for \`${fileName}\``

            session.hasUserPromptSupplied = message.prompt.length > 0

            // displaying user message prompt in Test tab
            this.messenger.sendMessage(userMessage, tabID, 'prompt')
            this.messenger.sendChatInputEnabled(tabID, false)
            this.sessionStorage.getSession().conversationState = ConversationState.IN_PROGRESS
            this.messenger.sendUpdatePromptProgress(message.tabID, testGenProgressField)

            const language = await this.getLanguageForFilePath(filePath)
            session.fileLanguage = language

            /*
                For Re:Invent 2024 we are supporting only java and python for unit test generation, rest of the languages shows the similar experience as CWC
            */
            if (language !== 'java' && language !== 'python') {
                const unsupportedLanguage = language.charAt(0).toUpperCase() + language.slice(1)
                let unsupportedMessage = `<span style="color: #EE9D28;">&#9888;<b>I'm sorry, but /test only supports Python and Java</b><br></span> While ${unsupportedLanguage} is not supported, I will generate a suggestion below. `
                // handle the case when language is undefined
                if (!unsupportedLanguage) {
                    unsupportedMessage = `<span style="color: #EE9D28;">&#9888;<b>I'm sorry, but /test only supports Python and Java</b><br></span> I will still generate a suggestion below. `
                }
                this.messenger.sendMessage(unsupportedMessage, tabID, 'answer')
                await this.onCodeGeneration(session, message.prompt, tabID, fileName, filePath)
            } else {
                this.messenger.sendCapabilityCard({ tabID })
                this.messenger.sendMessage(testGenSummaryMessage(fileName), message.tabID, 'answer-part')

                // Grab the selection from the fileEditorToTest and get the vscode Range
                const selection = fileEditorToTest.selection
                let selectionRange = undefined
                if (
                    selection.start.line !== selection.end.line ||
                    selection.start.character !== selection.end.character
                ) {
                    selectionRange = new vscode.Range(
                        selection.start.line,
                        selection.start.character,
                        selection.end.line,
                        selection.end.character
                    )
                }
                session.isCodeBlockSelected = selectionRange !== undefined

                /**
                 * Zip the project
                 * Create pre-signed URL and upload artifact to S3
                 * send API request to startTestGeneration API
                 * Poll from getTestGeneration API
                 * Get Diff from exportResultArchive API
                 */
                ChatSessionManager.Instance.setIsInProgress(true)
                await startTestGenerationProcess(fileName, filePath, message.prompt, tabID, true, selectionRange)
            }
        } catch (err: any) {
            // TODO: refactor error handling to be more robust
            ChatSessionManager.Instance.setIsInProgress(false)
            getLogger().error('startTestGen failed: %O', err)
            this.messenger.sendUpdatePromptProgress(message.tabID, cancellingProgressField)
            this.sendErrorMessage({ tabID, error: err })
            this.messenger.sendChatInputEnabled(tabID, true)
            this.sessionStorage.getSession().conversationState = ConversationState.WAITING_FOR_INPUT
            await sleep(2000)
            // eslint-disable-next-line unicorn/no-null
            this.messenger.sendUpdatePromptProgress(message.tabID, null)
        }
    }

    // Updating Progress bar
    private async handleUpdatePromptProgress(data: any) {
        const getProgressField = (status: string): ProgressField | null => {
            switch (status) {
                case 'Completed':
                    return testGenCompletedField
                case 'Error':
                    return errorProgressField
                case 'cancel':
                    return cancellingProgressField
                case 'InProgress':
                default:
                    return {
                        status: 'info',
                        text: 'Generating unit tests...',
                        value: data.progressRate,
                        valueText: data.progressRate.toString() + '%',
                        actions: [cancelTestGenButton],
                    }
            }
        }
        this.messenger.sendUpdatePromptProgress(data.tabID, getProgressField(data.status))

        await sleep(2000)

        // don't flash the bar when generation in progress
        if (data.status !== 'InProgress') {
            // eslint-disable-next-line unicorn/no-null
            this.messenger.sendUpdatePromptProgress(data.tabID, null)
        }
    }

    private async updateShortAnswer(message: {
        tabID: string
        status: string
        shortAnswer?: ShortAnswer
        testGenerationJobGroupName: string
        testGenerationJobId: string
        type: ChatItemType
        fileName: string
    }) {
        this.messenger.sendShortSummary({
            type: 'answer',
            tabID: message.tabID,
            message: testGenSummaryMessage(message.fileName, message.shortAnswer?.planSummary?.replaceAll('```', '')),
            canBeVoted: true,
            filePath: message.shortAnswer?.testFilePath,
        })
    }

    private async showCodeGenerationResults(data: { tabID: string; filePath: string; projectName: string }) {
        const session = this.sessionStorage.getSession()
        // return early if references are disabled and there are references
        if (!CodeWhispererSettings.instance.isSuggestionsWithCodeReferencesEnabled() && session.references.length > 0) {
            void vscode.window.showInformationMessage('Your settings do not allow code generation with references.')
            await this.endSession(data, FollowUpTypes.SkipBuildAndFinish)
            await this.sessionCleanUp()
            return
        }
        const followUps: FollowUps = {
            text: '',
            options: [
                {
                    pillText: `View diff`,
                    type: FollowUpTypes.ViewDiff,
                    status: 'primary',
                },
            ],
        }
        session.generatedFilePath = data.filePath
        try {
            const tempFilePath = path.join(this.tempResultDirPath, 'resultArtifacts', data.filePath)
            const newContent = await fs.readFileText(tempFilePath)
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            let linesGenerated = newContent.split('\n').length
            let charsGenerated = newContent.length
            if (workspaceFolder) {
                const projectPath = workspaceFolder.uri.fsPath
                const absolutePath = path.join(projectPath, data.filePath)
                const fileExists = await fs.existsFile(absolutePath)
                if (fileExists) {
                    const originalContent = await fs.readFileText(absolutePath)
                    linesGenerated -= originalContent.split('\n').length
                    charsGenerated -= originalContent.length
                }
            }
            session.linesOfCodeGenerated = linesGenerated > 0 ? linesGenerated : 0
            session.charsOfCodeGenerated = charsGenerated > 0 ? charsGenerated : 0
        } catch (e: any) {
            getLogger().debug('failed to get chars and lines of code generated from test generation result: %O', e)
        }

        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer',
            codeGenerationId: '',
            message: `Please see the unit tests generated below. Click “View diff” to review the changes in the code editor.`,
            canBeVoted: true,
            messageId: '',
            followUps,
            fileList: {
                fileTreeTitle: 'READY FOR REVIEW',
                rootFolderTitle: data.projectName,
                filePaths: [data.filePath],
            },
            codeReference: session.references.map(
                (ref: ShortAnswerReference) =>
                    ({
                        ...ref,
                        information: `${ref.licenseName} - <a href="${ref.url}">${ref.repository}</a>`,
                    }) as CodeReference
            ),
        })
        this.messenger.sendChatInputEnabled(data.tabID, false)
        this.messenger.sendUpdatePlaceholder(data.tabID, `Select View diff to see the generated unit tests.`)
        this.sessionStorage.getSession().conversationState = ConversationState.IDLE
    }

    private async openDiff(message: OpenDiffMessage) {
        const session = this.sessionStorage.getSession()
        const filePath = session.generatedFilePath
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder found')
        }
        const projectPath = workspaceFolder.uri.fsPath
        const absolutePath = path.join(projectPath, filePath)
        const fileExists = await fs.existsFile(absolutePath)
        const leftUri = fileExists ? vscode.Uri.file(absolutePath) : vscode.Uri.from({ scheme: 'untitled' })
        const rightUri = vscode.Uri.file(path.join(this.tempResultDirPath, 'resultArtifacts', filePath))
        const fileName = path.basename(absolutePath)
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} ${amazonQTabSuffix}`)
        telemetry.ui_click.emit({ elementId: 'unitTestGeneration_viewDiff' })
        session.latencyOfTestGeneration = performance.now() - session.testGenerationStartTime
        this.messenger.sendUpdatePlaceholder(message.tabID, `Please select an action to proceed (Accept or Reject)`)
    }

    private async acceptCode(message: any) {
        const session = this.sessionStorage.getSession()
        session.acceptedJobId = session.listOfTestGenerationJobId[session.listOfTestGenerationJobId.length - 1]
        const filePath = session.generatedFilePath
        const absolutePath = path.join(session.projectRootPath, filePath)
        const fileExists = await fs.existsFile(absolutePath)
        const buildCommand = session.updatedBuildCommands?.join(' ')

        const tempFilePath = path.join(this.tempResultDirPath, 'resultArtifacts', filePath)
        const updatedContent = await fs.readFileText(tempFilePath)
        let acceptedLines = updatedContent.split('\n').length
        let acceptedChars = updatedContent.length
        if (fileExists) {
            const originalContent = await fs.readFileText(absolutePath)
            acceptedLines -= originalContent.split('\n').length
            acceptedLines = acceptedLines < 0 ? 0 : acceptedLines
            acceptedChars -= originalContent.length
            acceptedChars = acceptedChars < 0 ? 0 : acceptedChars
            const document = await vscode.workspace.openTextDocument(absolutePath)
            await applyChanges(
                document,
                new vscode.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end),
                updatedContent
            )
        } else {
            await fs.writeFile(absolutePath, updatedContent)
        }
        session.charsOfCodeAccepted = acceptedChars
        session.linesOfCodeAccepted = acceptedLines

        // add accepted references to reference log, if any
        const fileName = path.basename(session.generatedFilePath)
        const time = new Date().toLocaleString()
        // TODO: this is duplicated in basicCommands.ts for scan (codewhisperer). Fix this later.
        session.references.forEach((reference) => {
            getLogger().debug('Processing reference: %O', reference)
            // Log values for debugging
            getLogger().debug('updatedContent: %s', updatedContent)
            getLogger().debug(
                'start: %d, end: %d',
                reference.recommendationContentSpan?.start,
                reference.recommendationContentSpan?.end
            )
            // given a start and end index, figure out which line number they belong to when splitting a string on /n characters
            const getLineNumber = (content: string, index: number): number => {
                const lines = content.slice(0, index).split('\n')
                return lines.length
            }
            const startLine = getLineNumber(updatedContent, reference.recommendationContentSpan!.start)
            const endLine = getLineNumber(updatedContent, reference.recommendationContentSpan!.end)
            getLogger().debug('startLine: %d, endLine: %d', startLine, endLine)

            const code = updatedContent.slice(
                reference.recommendationContentSpan?.start,
                reference.recommendationContentSpan?.end
            )
            getLogger().debug('Extracted code slice: %s', code)
            const referenceLog =
                `[${time}] Accepted recommendation ` +
                CodeWhispererConstants.referenceLogText(
                    `<br><code>${code}</code><br>`,
                    reference.licenseName!,
                    reference.repository!,
                    fileName,
                    startLine === endLine ? `(line at ${startLine})` : `(lines from ${startLine} to ${endLine})`
                ) +
                '<br>'
            getLogger().debug('Adding reference log: %s', referenceLog)
            ReferenceLogViewProvider.instance.addReferenceLog(referenceLog)
        })

        // TODO: see if there's a better way to check if active file is a diff
        if (vscode.window.tabGroups.activeTabGroup.activeTab?.label.includes(amazonQTabSuffix)) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        }
        const document = await vscode.workspace.openTextDocument(absolutePath)
        await vscode.window.showTextDocument(document)
        // TODO: send the message once again once build is enabled
        // this.messenger.sendMessage('Accepted', message.tabID, 'prompt')
        telemetry.ui_click.emit({ elementId: 'unitTestGeneration_acceptDiff' })
        telemetry.amazonq_utgGenerateTests.emit({
            generatedCount: session.numberOfTestsGenerated,
            acceptedCount: session.numberOfTestsGenerated,
            generatedCharactersCount: session.charsOfCodeGenerated,
            acceptedCharactersCount: session.charsOfCodeAccepted,
            generatedLinesCount: session.linesOfCodeGenerated,
            acceptedLinesCount: session.linesOfCodeAccepted,
            cwsprChatProgrammingLanguage: session.fileLanguage ?? 'plaintext',
            jobId: session.listOfTestGenerationJobId[0], // For RIV, UTG does only one StartTestGeneration API call so jobId = session.listOfTestGenerationJobId[0]
            jobGroup: session.testGenerationJobGroupName,
            requestId: session.startTestGenerationRequestId,
            buildPayloadBytes: session.srcPayloadSize,
            buildZipFileBytes: session.srcZipFileSize,
            artifactsUploadDuration: session.artifactsUploadDuration,
            hasUserPromptSupplied: session.hasUserPromptSupplied,
            isCodeBlockSelected: session.isCodeBlockSelected,
            perfClientLatency: session.latencyOfTestGeneration,
            isSupportedLanguage: true,
            credentialStartUrl: AuthUtil.instance.startUrl,
            result: 'Succeeded',
        })

        await this.endSession(message, FollowUpTypes.SkipBuildAndFinish)
        await this.sessionCleanUp()
        return

        if (session.listOfTestGenerationJobId.length === 1) {
            this.startInitialBuild(message)
            this.messenger.sendChatInputEnabled(message.tabID, false)
        } else if (session.listOfTestGenerationJobId.length < 4) {
            const remainingIterations = 4 - session.listOfTestGenerationJobId.length

            let userMessage = 'Would you like Amazon Q to build and execute again, and fix errors?'
            if (buildCommand) {
                userMessage += ` I will be running this build command: \`${buildCommand}\``
            }
            userMessage += `\nYou have ${remainingIterations} iteration${remainingIterations > 1 ? 's' : ''} left.`

            const followUps: FollowUps = {
                text: '',
                options: [
                    {
                        pillText: `Rebuild`,
                        type: FollowUpTypes.ContinueBuildAndExecute,
                        status: 'primary',
                    },
                    {
                        pillText: `Skip and finish`,
                        type: FollowUpTypes.SkipBuildAndFinish,
                        status: 'primary',
                    },
                ],
            }
            this.messenger.sendBuildProgressMessage({
                tabID: message.tabID,
                messageType: 'answer',
                codeGenerationId: '',
                message: userMessage,
                canBeVoted: false,
                messageId: '',
                followUps: followUps,
            })
            this.messenger.sendChatInputEnabled(message.tabID, false)
        } else {
            this.sessionStorage.getSession().listOfTestGenerationJobId = []
            this.messenger.sendMessage(
                'You have gone through both iterations and this unit test generation workflow is complete.',
                message.tabID,
                'answer'
            )
            await this.sessionCleanUp()
        }
        await fs.delete(this.tempResultDirPath, { recursive: true })
    }

    /**
     * Handle a regular incoming message when a user is in the code generation phase
     */
    private async onCodeGeneration(
        session: Session,
        message: string,
        tabID: string,
        fileName: string,
        filePath: string
    ) {
        try {
            // TODO: Write this entire gen response to basiccommands and call here.
            const editorText = await fs.readFileText(filePath)

            const triggerPayload = {
                query: `Generate unit tests for the following part of my code: ${message}`,
                codeSelection: undefined,
                trigger: ChatTriggerType.ChatMessage,
                fileText: editorText,
                fileLanguage: session.fileLanguage,
                filePath: filePath,
                message: `Generate unit tests for the following part of my code: ${message}`,
                matchPolicy: undefined,
                codeQuery: undefined,
                userIntent: UserIntent.GENERATE_UNIT_TESTS,
                customization: getSelectedCustomization(),
            }
            const chatRequest = triggerPayloadToChatRequest(triggerPayload)
            const client = await createCodeWhispererChatStreamingClient()
            const response = await client.generateAssistantResponse(chatRequest)
            await this.messenger.sendAIResponse(
                response,
                session,
                tabID,
                randomUUID.toString(),
                triggerPayload,
                fileName
            )
        } finally {
            this.messenger.sendChatInputEnabled(tabID, true)
            this.messenger.sendUpdatePlaceholder(tabID, `/test Generate unit tests...`)
            this.sessionStorage.getSession().conversationState = ConversationState.WAITING_FOR_INPUT
        }
    }

    // TODO: Check if there are more cases to endSession if yes create a enum or type for step
    private async endSession(data: any, step: FollowUpTypes) {
        const session = this.sessionStorage.getSession()
        if (step === FollowUpTypes.RejectCode) {
            telemetry.amazonq_utgGenerateTests.emit({
                generatedCount: session.numberOfTestsGenerated,
                acceptedCount: 0,
                generatedCharactersCount: session.charsOfCodeGenerated,
                acceptedCharactersCount: 0,
                generatedLinesCount: session.linesOfCodeGenerated,
                acceptedLinesCount: 0,
                cwsprChatProgrammingLanguage: session.fileLanguage ?? 'plaintext',
                jobId: session.listOfTestGenerationJobId[0], // For RIV, UTG does only one StartTestGeneration API call so jobId = session.listOfTestGenerationJobId[0]
                jobGroup: session.testGenerationJobGroupName,
                requestId: session.startTestGenerationRequestId,
                buildPayloadBytes: session.srcPayloadSize,
                buildZipFileBytes: session.srcZipFileSize,
                artifactsUploadDuration: session.artifactsUploadDuration,
                hasUserPromptSupplied: session.hasUserPromptSupplied,
                isCodeBlockSelected: session.isCodeBlockSelected,
                perfClientLatency: session.latencyOfTestGeneration,
                isSupportedLanguage: true,
                credentialStartUrl: AuthUtil.instance.startUrl,
                result: 'Succeeded',
            })
            telemetry.ui_click.emit({ elementId: 'unitTestGeneration_rejectDiff' })
        }

        await this.sessionCleanUp()
        // TODO: revert 'Accepted' to 'Skip build and finish' once supported
        const message = step === FollowUpTypes.RejectCode ? 'Rejected' : 'Accepted'

        this.messenger.sendMessage(message, data.tabID, 'prompt')
        this.messenger.sendMessage(`Unit test generation workflow is completed.`, data.tabID, 'answer')
        this.messenger.sendChatInputEnabled(data.tabID, true)
        return
    }

    /**
     * BUILD LOOP IMPLEMENTATION
     */

    private startInitialBuild(data: any) {
        // TODO: Remove the fallback build command after stable version of backend build command.
        const userMessage = `Would you like me to help build and execute the test? I will need you to let me know what build command to run if you do.`
        const followUps: FollowUps = {
            text: '',
            options: [
                {
                    pillText: `Specify command then build and execute`,
                    type: FollowUpTypes.ModifyCommands,
                    status: 'primary',
                },
                {
                    pillText: `Skip and finish`,
                    type: FollowUpTypes.SkipBuildAndFinish,
                    status: 'primary',
                },
            ],
        }
        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer',
            codeGenerationId: '',
            message: userMessage,
            canBeVoted: false,
            messageId: '',
            followUps: followUps,
        })
        this.messenger.sendChatInputEnabled(data.tabID, false)
    }

    private async checkForInstallationDependencies(data: any) {
        // const session: Session = this.sessionStorage.getSession()
        // const listOfInstallationDependencies = session.testGenerationJob?.shortAnswer?.installationDependencies || []
        // MOCK: As there is no installation dependencies in shortAnswer
        const listOfInstallationDependencies = ['']
        const installationDependencies = listOfInstallationDependencies.join('\n')

        this.messenger.sendMessage('Build and execute', data.tabID, 'prompt')
        telemetry.ui_click.emit({ elementId: 'unitTestGeneration_buildAndExecute' })

        if (installationDependencies.length > 0) {
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer',
                codeGenerationId: '',
                message: `Looks like you don’t have ${listOfInstallationDependencies.length > 1 ? `these` : `this`} ${listOfInstallationDependencies.length} required package${listOfInstallationDependencies.length > 1 ? `s` : ``} installed.\n\`\`\`sh\n${installationDependencies}\n`,
                canBeVoted: false,
                messageId: '',
                followUps: {
                    text: '',
                    options: [
                        {
                            pillText: `Install and continue`,
                            type: FollowUpTypes.InstallDependenciesAndContinue,
                            status: 'primary',
                        },
                        {
                            pillText: `Skip and finish`,
                            type: FollowUpTypes.SkipBuildAndFinish,
                            status: 'primary',
                        },
                    ],
                },
            })
        } else {
            await this.startLocalBuildExecution(data)
        }
    }

    private async handleInstallDependencies(data: any) {
        this.messenger.sendMessage('Installation dependencies and continue', data.tabID, 'prompt')
        telemetry.ui_click.emit({ elementId: 'unitTestGeneration_installDependenciesAndContinue' })
        void this.startLocalBuildExecution(data)
    }

    private async handleBuildIteration(data: any) {
        this.messenger.sendMessage('Proceed with Iteration', data.tabID, 'prompt')
        telemetry.ui_click.emit({ elementId: 'unitTestGeneration_proceedWithIteration' })
        await this.startLocalBuildExecution(data)
    }

    private async startLocalBuildExecution(data: any) {
        const session: Session = this.sessionStorage.getSession()
        // const installationDependencies = session.shortAnswer?.installationDependencies ?? []
        // MOCK: ignoring the installation case until backend send response
        const installationDependencies: string[] = []
        const buildCommands = session.updatedBuildCommands
        if (!buildCommands) {
            throw new Error('Build command not found')
            return
        }

        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer-part',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: testGenBuildProgressMessage(TestGenerationBuildStep.START_STEP),
            canBeVoted: false,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
        })

        this.messenger.sendUpdatePromptProgress(data.tabID, buildProgressField)

        if (installationDependencies.length > 0 && session.listOfTestGenerationJobId.length < 2) {
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer-part',
                codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                message: testGenBuildProgressMessage(TestGenerationBuildStep.INSTALL_DEPENDENCIES, 'current'),
                canBeVoted: false,
                messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            })

            const status = await runBuildCommand(installationDependencies)
            // TODO: Add separate status for installation dependencies
            session.buildStatus = status
            if (status === BuildStatus.FAILURE) {
                this.messenger.sendBuildProgressMessage({
                    tabID: data.tabID,
                    messageType: 'answer-part',
                    codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                    message: testGenBuildProgressMessage(TestGenerationBuildStep.INSTALL_DEPENDENCIES, 'error'),
                    canBeVoted: false,
                    messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                })
            }
            if (status === BuildStatus.CANCELLED) {
                this.messenger.sendBuildProgressMessage({
                    tabID: data.tabID,
                    messageType: 'answer-part',
                    codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                    message: testGenBuildProgressMessage(TestGenerationBuildStep.INSTALL_DEPENDENCIES, 'error'),
                    canBeVoted: false,
                    messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                })
                this.messenger.sendMessage('Installation dependencies Cancelled', data.tabID, 'prompt')
                this.messenger.sendMessage(
                    'Unit test generation workflow is complete. You have 25 out of 30 Amazon Q Developer Agent invocations left this month.',
                    data.tabID,
                    'answer'
                )
                return
            }
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer-part',
                codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                message: testGenBuildProgressMessage(TestGenerationBuildStep.INSTALL_DEPENDENCIES, 'done'),
                canBeVoted: false,
                messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            })
        }

        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer-part',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: testGenBuildProgressMessage(TestGenerationBuildStep.RUN_BUILD, 'current'),
            canBeVoted: false,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
        })

        const buildStatus = await runBuildCommand(buildCommands)
        session.buildStatus = buildStatus

        if (buildStatus === BuildStatus.FAILURE) {
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer-part',
                codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                message: testGenBuildProgressMessage(TestGenerationBuildStep.RUN_BUILD, 'error'),
                canBeVoted: false,
                messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            })
        } else if (buildStatus === BuildStatus.CANCELLED) {
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer-part',
                codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                message: testGenBuildProgressMessage(TestGenerationBuildStep.RUN_BUILD, 'error'),
                canBeVoted: false,
                messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            })
            this.messenger.sendMessage('Build Cancelled', data.tabID, 'prompt')
            this.messenger.sendMessage('Unit test generation workflow is complete.', data.tabID, 'answer')
            return
        } else {
            // Build successful
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer-part',
                codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                message: testGenBuildProgressMessage(TestGenerationBuildStep.RUN_BUILD, 'done'),
                canBeVoted: false,
                messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            })
        }

        // Running execution tests
        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer-part',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: testGenBuildProgressMessage(TestGenerationBuildStep.RUN_EXECUTION_TESTS, 'current'),
            canBeVoted: false,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
        })
        // After running tests
        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer-part',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: testGenBuildProgressMessage(TestGenerationBuildStep.RUN_EXECUTION_TESTS, 'done'),
            canBeVoted: false,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
        })
        if (session.buildStatus !== BuildStatus.SUCCESS) {
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer-part',
                codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                message: testGenBuildProgressMessage(TestGenerationBuildStep.FIXING_TEST_CASES, 'current'),
                canBeVoted: false,
                messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            })
            await startTestGenerationProcess(
                path.basename(session.sourceFilePath),
                session.sourceFilePath,
                '',
                data.tabID,
                false
            )
        }
        // TODO: Skip this if startTestGenerationProcess timeouts
        if (session.generatedFilePath) {
            await this.showTestCaseSummary(data)
        }
    }

    private async showTestCaseSummary(data: { tabID: string }) {
        const session: Session = this.sessionStorage.getSession()
        let codeDiffLength = 0
        if (session.buildStatus !== BuildStatus.SUCCESS) {
            // Check the generated test file content, if fileContent length is 0, exit the unit test generation workflow.
            const tempFilePath = path.join(this.tempResultDirPath, 'resultArtifacts', session.generatedFilePath)
            const codeDiffFileContent = await fs.readFileText(tempFilePath)
            codeDiffLength = codeDiffFileContent.length
            this.messenger.sendBuildProgressMessage({
                tabID: data.tabID,
                messageType: 'answer-part',
                codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
                message: testGenBuildProgressMessage(TestGenerationBuildStep.FIXING_TEST_CASES + 1, 'done'),
                canBeVoted: false,
                messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            })
        }

        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer-part',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: testGenBuildProgressMessage(TestGenerationBuildStep.PROCESS_TEST_RESULTS, 'current'),
            canBeVoted: false,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
        })

        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer-part',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: testGenBuildProgressMessage(TestGenerationBuildStep.PROCESS_TEST_RESULTS, 'done'),
            canBeVoted: false,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
        })

        const followUps: FollowUps = {
            text: '',
            options: [
                {
                    pillText: `View diff`,
                    type: FollowUpTypes.ViewCodeDiffAfterIteration,
                    status: 'primary',
                },
            ],
        }
        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer-part',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: testGenBuildProgressMessage(TestGenerationBuildStep.PROCESS_TEST_RESULTS + 1),
            canBeVoted: true,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            followUps: undefined,
            fileList: this.checkCodeDiffLengthAndBuildStatus({ codeDiffLength, buildStatus: session.buildStatus })
                ? {
                      fileTreeTitle: 'READY FOR REVIEW',
                      rootFolderTitle: 'tests',
                      filePaths: [session.generatedFilePath],
                  }
                : undefined,
        })
        this.messenger.sendBuildProgressMessage({
            tabID: data.tabID,
            messageType: 'answer',
            codeGenerationId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            message: undefined,
            canBeVoted: false,
            messageId: TestNamedMessages.TEST_GENERATION_BUILD_STATUS_MESSAGE,
            followUps: this.checkCodeDiffLengthAndBuildStatus({ codeDiffLength, buildStatus: session.buildStatus })
                ? followUps
                : undefined,
            fileList: undefined,
        })

        this.messenger.sendUpdatePromptProgress(data.tabID, testGenCompletedField)
        await sleep(2000)
        // eslint-disable-next-line unicorn/no-null
        this.messenger.sendUpdatePromptProgress(data.tabID, null)
        this.messenger.sendChatInputEnabled(data.tabID, false)

        if (codeDiffLength === 0 || session.buildStatus === BuildStatus.SUCCESS) {
            this.messenger.sendMessage('Unit test generation workflow is complete.', data.tabID, 'answer')
            await this.sessionCleanUp()
        }
    }

    private modifyBuildCommand(data: any) {
        this.sessionStorage.getSession().conversationState = ConversationState.WAITING_FOR_BUILD_COMMMAND_INPUT
        this.messenger.sendMessage('Specify commands then build', data.tabID, 'prompt')
        telemetry.ui_click.emit({ elementId: 'unitTestGeneration_modifyCommand' })
        this.messenger.sendMessage(
            'Sure, provide all command lines you’d like me to run to build.',
            data.tabID,
            'answer'
        )
        this.messenger.sendUpdatePlaceholder(data.tabID, 'Waiting on your Inputs')
        this.messenger.sendChatInputEnabled(data.tabID, true)
    }

    /** Perform Session CleanUp in below cases
     * UTG success
     * End Session with Reject or SkipAndFinish
     * After finishing 3 build loop iterations
     * Error while generating unit tests
     * Closing a Q-Test tab
     * Progress bar cancel
     */
    private async sessionCleanUp() {
        const session = this.sessionStorage.getSession()
        const groupName = session.testGenerationJobGroupName
        const filePath = session.generatedFilePath
        getLogger().debug('Entering sessionCleanUp function with filePath: %s and groupName: %s', filePath, groupName)

        vscode.window.tabGroups.all.flatMap(({ tabs }) =>
            tabs.map((tab) => {
                if (tab.label === `${path.basename(filePath)} ${amazonQTabSuffix}`) {
                    const tabClosed = vscode.window.tabGroups.close(tab)
                    if (!tabClosed) {
                        getLogger().error('ChatDiff: Unable to close the diff view tab for %s', tab.label)
                    }
                }
            })
        )

        getLogger().debug(
            'listOfTestGenerationJobId length: %d, groupName: %s',
            session.listOfTestGenerationJobId.length,
            groupName
        )
        if (session.listOfTestGenerationJobId.length && groupName) {
            session.listOfTestGenerationJobId.forEach((id) => {
                if (id === session.acceptedJobId) {
                    TelemetryHelper.instance.sendTestGenerationEvent(
                        groupName,
                        id,
                        session.fileLanguage,
                        session.numberOfTestsGenerated,
                        session.numberOfTestsGenerated, // this is number of accepted test cases, now they can only accept all
                        session.linesOfCodeGenerated,
                        session.linesOfCodeAccepted,
                        session.charsOfCodeGenerated,
                        session.charsOfCodeAccepted
                    )
                } else {
                    TelemetryHelper.instance.sendTestGenerationEvent(
                        groupName,
                        id,
                        session.fileLanguage,
                        session.numberOfTestsGenerated,
                        0,
                        session.linesOfCodeGenerated,
                        0,
                        session.charsOfCodeGenerated,
                        0
                    )
                }
            })
        }
        session.listOfTestGenerationJobId = []
        session.testGenerationJobGroupName = undefined
        session.testGenerationJob = undefined
        session.updatedBuildCommands = undefined
        session.shortAnswer = undefined
        session.testCoveragePercentage = 0
        session.conversationState = ConversationState.IDLE
        session.sourceFilePath = ''
        session.generatedFilePath = ''
        session.projectRootPath = ''
        session.stopIteration = false
        session.fileLanguage = undefined
        ChatSessionManager.Instance.setIsInProgress(false)
        session.linesOfCodeGenerated = 0
        session.linesOfCodeAccepted = 0
        session.charsOfCodeGenerated = 0
        session.charsOfCodeAccepted = 0
        session.acceptedJobId = ''
        session.numberOfTestsGenerated = 0
        if (session.tabID) {
            getLogger().debug('Setting input state with tabID: %s', session.tabID)
            this.messenger.sendChatInputEnabled(session.tabID, true)
            this.messenger.sendUpdatePlaceholder(session.tabID, '/test Generate unit tests') // TODO: Change according to the UX
        }
        getLogger().debug(
            'Deleting output.log and temp result directory. testGenerationLogsDir: %s',
            testGenerationLogsDir
        )
        await fs.delete(path.join(testGenerationLogsDir, 'output.log'))
        await fs.delete(this.tempResultDirPath, { recursive: true })
    }

    // TODO: return build command when product approves
    // private getBuildCommands = (): string[] => {
    //     const session = this.sessionStorage.getSession()
    //     if (session.updatedBuildCommands?.length) {
    //         return [...session.updatedBuildCommands]
    //     }

    //     // For Internal amazon users only
    //     if (Auth.instance.isInternalAmazonUser()) {
    //         return ['brazil-build release']
    //     }

    //     if (session.shortAnswer && Array.isArray(session.shortAnswer?.buildCommands)) {
    //         return [...session.shortAnswer.buildCommands]
    //     }

    //     return ['source qdev-wbr/.venv/bin/activate && pytest --continue-on-collection-errors']
    // }
}
