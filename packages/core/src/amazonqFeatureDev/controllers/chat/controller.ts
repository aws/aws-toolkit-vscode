/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemAction, MynahIcons } from '@aws/mynah-ui'
import * as path from 'path'
import * as vscode from 'vscode'
import { EventEmitter } from 'vscode'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { createSingleFileDialog } from '../../../shared/ui/common/openDialog'
import {
    CodeIterationLimitError,
    ContentLengthError,
    createUserFacingErrorMessage,
    denyListedErrors,
    FeatureDevServiceError,
    isAPIClientError,
    MonthlyConversationLimitError,
    NoChangeRequiredException,
    PrepareRepoFailedError,
    PromptRefusalException,
    SelectedFolderNotInWorkspaceFolderError,
    TabIdNotFoundError,
    UploadCodeError,
    UploadURLExpired,
    UserMessageNotFoundError,
    WorkspaceFolderNotFoundError,
    ZipFileError,
} from '../../errors'
import { codeGenRetryLimit, defaultRetryLimit } from '../../limits'
import { Session } from '../../session/session'
import { featureDevScheme, featureName, generateDevFilePrompt } from '../../constants'
import {
    DeletedFileInfo,
    DevPhase,
    MetricDataOperationName,
    MetricDataResult,
    type NewFileInfo,
} from '../../../amazonq/commons/types'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { AuthController } from '../../../amazonq/auth/controller'
import { getLogger } from '../../../shared/logger/logger'
import { submitFeedback } from '../../../feedback/vue/submitFeedback'
import { placeholder } from '../../../shared/vscode/commands2'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'
import { openUrl } from '../../../shared/utilities/vsCodeUtils'
import { checkForDevFile, getPathsFromZipFilePath } from '../../../amazonq/util/files'
import { examples, messageWithConversationId } from '../../userFacingText'
import { getWorkspaceFoldersByPrefixes } from '../../../shared/utilities/workspaceUtils'
import { openDeletedDiff, openDiff } from '../../../amazonq/commons/diff'
import { i18n } from '../../../shared/i18n-helper'
import globals from '../../../shared/extensionGlobals'
import { CodeWhispererSettings } from '../../../codewhisperer/util/codewhispererSettings'
import { randomUUID } from '../../../shared/crypto'
import { FollowUpTypes } from '../../../amazonq/commons/types'
import { Messenger } from '../../../amazonq/commons/connector/baseMessenger'
import { BaseChatSessionStorage } from '../../../amazonq/commons/baseChatStorage'

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
    readonly storeCodeResultMessageId: EventEmitter<any>
}

type OpenDiffMessage = {
    tabID: string
    messageId: string
    // currently the zip file path
    filePath: string
    deleted: boolean
    codeGenerationId: string
}

type fileClickedMessage = {
    tabID: string
    messageId: string
    filePath: string
    actionName: string
}

type StoreMessageIdMessage = {
    tabID: string
    messageId: string
}

export class FeatureDevController {
    private readonly scheme: string = featureDevScheme
    private readonly messenger: Messenger
    private readonly sessionStorage: BaseChatSessionStorage<Session>
    private isAmazonQVisible: boolean
    private authController: AuthController
    private contentController: EditorContentController

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: Messenger,
        sessionStorage: BaseChatSessionStorage<Session>,
        onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.messenger = messenger
        this.sessionStorage = sessionStorage
        this.authController = new AuthController()
        this.contentController = new EditorContentController()

        /**
         * defaulted to true because onDidChangeAmazonQVisibility doesn't get fire'd until after
         * the view is opened
         */
        this.isAmazonQVisible = true

        onDidChangeAmazonQVisibility((visible) => {
            this.isAmazonQVisible = visible
        })

        this.chatControllerMessageListeners.processHumanChatMessage.event((data) => {
            this.processUserChatMessage(data).catch((e) => {
                getLogger().error('processUserChatMessage failed: %s', (e as Error).message)
            })
        })
        this.chatControllerMessageListeners.processChatItemVotedMessage.event((data) => {
            this.processChatItemVotedMessage(data.tabID, data.vote).catch((e) => {
                getLogger().error('processChatItemVotedMessage failed: %s', (e as Error).message)
            })
        })
        this.chatControllerMessageListeners.processChatItemFeedbackMessage.event((data) => {
            this.processChatItemFeedbackMessage(data).catch((e) => {
                getLogger().error('processChatItemFeedbackMessage failed: %s', (e as Error).message)
            })
        })
        this.chatControllerMessageListeners.followUpClicked.event((data) => {
            switch (data.followUp.type) {
                case FollowUpTypes.InsertCode:
                    return this.insertCode(data)
                case FollowUpTypes.ProvideFeedbackAndRegenerateCode:
                    return this.provideFeedbackAndRegenerateCode(data)
                case FollowUpTypes.Retry:
                    return this.retryRequest(data)
                case FollowUpTypes.ModifyDefaultSourceFolder:
                    return this.modifyDefaultSourceFolder(data)
                case FollowUpTypes.DevExamples:
                    this.initialExamples(data)
                    break
                case FollowUpTypes.NewTask:
                    this.messenger.sendAnswer({
                        type: 'answer',
                        tabID: data?.tabID,
                        message: i18n('AWS.amazonq.featureDev.answer.newTaskChanges'),
                    })
                    return this.newTask(data)
                case FollowUpTypes.CloseSession:
                    return this.closeSession(data)
                case FollowUpTypes.SendFeedback:
                    this.sendFeedback()
                    break
                case FollowUpTypes.AcceptAutoBuild:
                    return this.processAutoBuildSetting(true, data)
                case FollowUpTypes.DenyAutoBuild:
                    return this.processAutoBuildSetting(false, data)
                case FollowUpTypes.GenerateDevFile:
                    this.messenger.sendAnswer({
                        type: 'system-prompt',
                        tabID: data?.tabID,
                        message: i18n('AWS.amazonq.featureDev.pillText.generateDevFile'),
                    })
                    return this.newTask(data, generateDevFilePrompt)
            }
        })
        this.chatControllerMessageListeners.openDiff.event((data) => {
            return this.openDiff(data)
        })
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
        this.chatControllerMessageListeners.insertCodeAtPositionClicked.event((data) => {
            this.insertCodeAtPosition(data)
        })
        this.chatControllerMessageListeners.fileClicked.event(async (data) => {
            return await this.fileClicked(data)
        })
        this.chatControllerMessageListeners.storeCodeResultMessageId.event(async (data) => {
            return await this.storeCodeResultMessageId(data)
        })
    }

    private async processChatItemVotedMessage(tabId: string, vote: string) {
        const session = await this.sessionStorage.getSession(tabId)

        if (vote === 'upvote') {
            telemetry.amazonq_codeGenerationThumbsUp.emit({
                amazonqConversationId: session?.conversationId,
                value: 1,
                result: 'Succeeded',
                credentialStartUrl: AuthUtil.instance.startUrl,
            })
        } else if (vote === 'downvote') {
            telemetry.amazonq_codeGenerationThumbsDown.emit({
                amazonqConversationId: session?.conversationId,
                value: 1,
                result: 'Succeeded',
                credentialStartUrl: AuthUtil.instance.startUrl,
            })
        }
    }

    private async processChatItemFeedbackMessage(message: any) {
        const session = await this.sessionStorage.getSession(message.tabId)

        await globals.telemetry.postFeedback({
            comment: `${JSON.stringify({
                type: 'featuredev-chat-answer-feedback',
                conversationId: session?.conversationId ?? '',
                messageId: message?.messageId,
                reason: message?.selectedOption,
                userComment: message?.comment,
            })}`,
            sentiment: 'Negative', // The chat UI reports only negative feedback currently.
        })
    }

    private processErrorChatMessage = (err: any, message: any, session: Session | undefined) => {
        const errorMessage = createUserFacingErrorMessage(
            `${featureName} request failed: ${err.cause?.message ?? err.message}`
        )

        let defaultMessage
        const isDenyListedError = denyListedErrors.some((denyListedError) => err.message.includes(denyListedError))

        switch (err.constructor.name) {
            case ContentLengthError.name:
                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID: message.tabID,
                    message: err.message + messageWithConversationId(session?.conversationIdUnsafe),
                    canBeVoted: true,
                })
                this.messenger.sendAnswer({
                    type: 'system-prompt',
                    tabID: message.tabID,
                    followUps: [
                        {
                            pillText: i18n('AWS.amazonq.featureDev.pillText.modifyDefaultSourceFolder'),
                            type: 'ModifyDefaultSourceFolder',
                            status: 'info',
                        },
                    ],
                })
                break
            case MonthlyConversationLimitError.name:
                this.messenger.sendMonthlyLimitError(message.tabID)
                break
            case FeatureDevServiceError.name:
            case UploadCodeError.name:
            case UserMessageNotFoundError.name:
            case TabIdNotFoundError.name:
            case PrepareRepoFailedError.name:
                this.messenger.sendErrorMessage(
                    errorMessage,
                    message.tabID,
                    this.retriesRemaining(session),
                    session?.conversationIdUnsafe
                )
                break
            case PromptRefusalException.name:
            case ZipFileError.name:
                this.messenger.sendErrorMessage(errorMessage, message.tabID, 0, session?.conversationIdUnsafe, true)
                break
            case NoChangeRequiredException.name:
                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID: message.tabID,
                    message: err.message,
                    canBeVoted: true,
                })
                // Allow users to re-work the task description.
                return this.newTask(message)
            case CodeIterationLimitError.name:
                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID: message.tabID,
                    message: err.message + messageWithConversationId(session?.conversationIdUnsafe),
                    canBeVoted: true,
                })
                this.messenger.sendAnswer({
                    type: 'system-prompt',
                    tabID: message.tabID,
                    followUps: [
                        {
                            pillText:
                                session?.getInsertCodePillText([
                                    ...(session?.state.filePaths ?? []),
                                    ...(session?.state.deletedFiles ?? []),
                                ]) ?? i18n('AWS.amazonq.featureDev.pillText.acceptAllChanges'),
                            type: FollowUpTypes.InsertCode,
                            icon: 'ok' as MynahIcons,
                            status: 'success',
                        },
                    ],
                })
                break
            case UploadURLExpired.name:
                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID: message.tabID,
                    message: err.message,
                    canBeVoted: true,
                })
                break
            default:
                if (isDenyListedError || this.retriesRemaining(session) === 0) {
                    defaultMessage = i18n('AWS.amazonq.featureDev.error.codeGen.denyListedError')
                } else {
                    defaultMessage = i18n('AWS.amazonq.featureDev.error.codeGen.default')
                }

                this.messenger.sendErrorMessage(
                    defaultMessage ? defaultMessage : errorMessage,
                    message.tabID,
                    this.retriesRemaining(session),
                    session?.conversationIdUnsafe,
                    !!defaultMessage
                )

                break
        }
    }

    /**
     *
     * This function dispose cancellation token to free resources and provide a new token.
     * Since user can abort a call in the same session, when the processing ends, we need provide a new one
     * to start with the new prompt and allow the ability to stop again.
     *
     * @param session
     */

    private disposeToken(session: Session | undefined) {
        if (session?.state?.tokenSource?.token.isCancellationRequested) {
            session?.state.tokenSource?.dispose()
            if (session?.state?.tokenSource) {
                session.state.tokenSource = new vscode.CancellationTokenSource()
            }
            getLogger().debug('Request cancelled, skipping further processing')
        }
    }

    // TODO add type
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

        let session
        try {
            getLogger().debug(`${featureName}: Processing message: ${message.message}`)

            session = await this.sessionStorage.getSession(message.tabID)
            // set latestMessage in session as retry would lose context if function returns early
            session.latestMessage = message.message

            await session.disableFileList()
            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                await this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }

            const root = session.getWorkspaceRoot()
            const autoBuildProjectSetting = CodeWhispererSettings.instance.getAutoBuildSetting()
            const hasDevfile = await checkForDevFile(root)
            const isPromptedForAutoBuildFeature = Object.keys(autoBuildProjectSetting).includes(root)

            if (hasDevfile && !isPromptedForAutoBuildFeature) {
                await this.promptAllowQCommandsConsent(message.tabID)
                return
            }

            await session.preloader()

            if (session.state.phase === DevPhase.CODEGEN) {
                await this.onCodeGeneration(session, message.message, message.tabID)
            }
        } catch (err: any) {
            this.disposeToken(session)
            await this.processErrorChatMessage(err, message, session)
            // Lock the chat input until they explicitly click one of the follow ups
            this.messenger.sendChatInputEnabled(message.tabID, false)
        }
    }

    private async promptAllowQCommandsConsent(tabID: string) {
        this.messenger.sendAnswer({
            tabID: tabID,
            message: i18n('AWS.amazonq.featureDev.answer.devFileInRepository'),
            type: 'answer',
        })

        this.messenger.sendAnswer({
            message: undefined,
            type: 'system-prompt',
            followUps: [
                {
                    pillText: i18n('AWS.amazonq.featureDev.pillText.acceptForProject'),
                    type: FollowUpTypes.AcceptAutoBuild,
                    status: 'success',
                },
                {
                    pillText: i18n('AWS.amazonq.featureDev.pillText.declineForProject'),
                    type: FollowUpTypes.DenyAutoBuild,
                    status: 'error',
                },
            ],
            tabID: tabID,
        })
    }

    /**
     * Handle a regular incoming message when a user is in the code generation phase
     */
    private async onCodeGeneration(session: Session, message: string, tabID: string) {
        // lock the UI/show loading bubbles
        this.messenger.sendAsyncEventProgress(
            tabID,
            true,
            session.retries === codeGenRetryLimit
                ? i18n('AWS.amazonq.featureDev.pillText.awaitMessage')
                : i18n('AWS.amazonq.featureDev.pillText.awaitMessageRetry')
        )

        try {
            this.messenger.sendAnswer({
                message: i18n('AWS.amazonq.featureDev.pillText.requestingChanges'),
                type: 'answer-stream',
                tabID,
                canBeVoted: true,
            })
            this.messenger.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.featureDev.pillText.generatingCode'))
            await session.sendMetricDataTelemetry(MetricDataOperationName.StartCodeGeneration, MetricDataResult.Success)
            await session.send(message)
            const filePaths = session.state.filePaths ?? []
            const deletedFiles = session.state.deletedFiles ?? []
            // Only add the follow up accept/deny buttons when the tab hasn't been closed/request hasn't been cancelled
            if (session?.state?.tokenSource?.token.isCancellationRequested) {
                return
            }

            if (filePaths.length === 0 && deletedFiles.length === 0) {
                this.messenger.sendAnswer({
                    message: i18n('AWS.amazonq.featureDev.pillText.unableGenerateChanges'),
                    type: 'answer',
                    tabID: tabID,
                    canBeVoted: true,
                })
                this.messenger.sendAnswer({
                    type: 'system-prompt',
                    tabID: tabID,
                    followUps:
                        this.retriesRemaining(session) > 0
                            ? [
                                  {
                                      pillText: i18n('AWS.amazonq.featureDev.pillText.retry'),
                                      type: FollowUpTypes.Retry,
                                      status: 'warning',
                                  },
                              ]
                            : [],
                })
                // Lock the chat input until they explicitly click retry
                this.messenger.sendChatInputEnabled(tabID, false)
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

            const remainingIterations = session.state.codeGenerationRemainingIterationCount
            const totalIterations = session.state.codeGenerationTotalIterationCount

            if (remainingIterations !== undefined && totalIterations !== undefined) {
                this.messenger.sendAnswer({
                    type: 'answer' as const,
                    tabID: tabID,
                    message: (() => {
                        if (remainingIterations > 2) {
                            return 'Would you like me to add this code to your project, or provide feedback for new code?'
                        } else if (remainingIterations > 0) {
                            return `Would you like me to add this code to your project, or provide feedback for new code? You have ${remainingIterations} out of ${totalIterations} code generations left.`
                        } else {
                            return 'Would you like me to add this code to your project?'
                        }
                    })(),
                })
            }

            if (session?.state.phase === DevPhase.CODEGEN) {
                const messageId = randomUUID()
                session.updateAcceptCodeMessageId(messageId)
                session.updateAcceptCodeTelemetrySent(false)
                // need to add the followUps with an extra update here, or it will double-render them
                this.messenger.sendAnswer({
                    message: undefined,
                    type: 'system-prompt',
                    followUps: [],
                    tabID: tabID,
                    messageId,
                })
                await session.updateChatAnswer(tabID, i18n('AWS.amazonq.featureDev.pillText.acceptAllChanges'))
                await session.sendLinesOfCodeGeneratedTelemetry()
            }
            this.messenger.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.featureDev.pillText.selectOption'))
        } catch (err: any) {
            getLogger().error(`${featureName}: Error during code generation: ${err}`)

            let result: string
            switch (err.constructor.name) {
                case FeatureDevServiceError.name:
                    if (err.code === 'EmptyPatchException') {
                        result = MetricDataResult.LlmFailure
                    } else if (err.code === 'GuardrailsException' || err.code === 'ThrottlingException') {
                        result = MetricDataResult.Error
                    } else {
                        result = MetricDataResult.Fault
                    }
                    break
                case MonthlyConversationLimitError.name:
                case CodeIterationLimitError.name:
                case PromptRefusalException.name:
                case NoChangeRequiredException.name:
                    result = MetricDataResult.Error
                    break
                default:
                    if (isAPIClientError(err)) {
                        result = MetricDataResult.Error
                    } else {
                        result = MetricDataResult.Fault
                    }
                    break
            }

            await session.sendMetricDataTelemetry(MetricDataOperationName.EndCodeGeneration, result)
            throw err
        } finally {
            // Finish processing the event

            if (session?.state?.tokenSource?.token.isCancellationRequested) {
                await this.workOnNewTask(
                    session.tabID,
                    session.state.codeGenerationRemainingIterationCount,
                    session.state.codeGenerationTotalIterationCount,
                    session?.state?.tokenSource?.token.isCancellationRequested
                )
                this.disposeToken(session)
            } else {
                this.messenger.sendAsyncEventProgress(tabID, false, undefined)

                // Lock the chat input until they explicitly click one of the follow ups
                this.messenger.sendChatInputEnabled(tabID, false)

                if (!this.isAmazonQVisible) {
                    const open = 'Open chat'
                    const resp = await vscode.window.showInformationMessage(
                        i18n('AWS.amazonq.featureDev.answer.qGeneratedCode'),
                        open
                    )
                    if (resp === open) {
                        await vscode.commands.executeCommand('aws.AmazonQChatView.focus')
                        // TODO add focusing on the specific tab once that's implemented
                    }
                }
            }
        }
        await session.sendMetricDataTelemetry(MetricDataOperationName.EndCodeGeneration, MetricDataResult.Success)
    }

    private sendUpdateCodeMessage(tabID: string) {
        this.messenger.sendAnswer({
            type: 'answer',
            tabID,
            message: i18n('AWS.amazonq.featureDev.answer.updateCode'),
            canBeVoted: true,
        })
    }

    private async workOnNewTask(
        tabID: string,
        remainingIterations: number = 0,
        totalIterations?: number,
        isStoppedGeneration: boolean = false
    ) {
        const hasDevFile = await checkForDevFile((await this.sessionStorage.getSession(tabID)).getWorkspaceRoot())

        if (isStoppedGeneration) {
            this.messenger.sendAnswer({
                message: ((remainingIterations) => {
                    if (totalIterations !== undefined) {
                        if (remainingIterations <= 0) {
                            return "I stopped generating your code. You don't have more iterations left, however, you can start a new session."
                        } else if (remainingIterations <= 2) {
                            return `I stopped generating your code. If you want to continue working on this task, provide another description. You have ${remainingIterations} out of ${totalIterations} code generations left.`
                        }
                    }
                    return 'I stopped generating your code. If you want to continue working on this task, provide another description.'
                })(remainingIterations),
                type: 'answer-part',
                tabID,
            })
        }

        if ((remainingIterations <= 0 && isStoppedGeneration) || !isStoppedGeneration) {
            const followUps: Array<ChatItemAction> = [
                {
                    pillText: i18n('AWS.amazonq.featureDev.pillText.newTask'),
                    type: FollowUpTypes.NewTask,
                    status: 'info',
                },
                {
                    pillText: i18n('AWS.amazonq.featureDev.pillText.closeSession'),
                    type: FollowUpTypes.CloseSession,
                    status: 'info',
                },
            ]

            if (!hasDevFile) {
                followUps.push({
                    pillText: i18n('AWS.amazonq.featureDev.pillText.generateDevFile'),
                    type: FollowUpTypes.GenerateDevFile,
                    status: 'info',
                })

                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID,
                    message: i18n('AWS.amazonq.featureDev.answer.devFileSuggestion'),
                })
            }

            this.messenger.sendAnswer({
                type: 'system-prompt',
                tabID,
                followUps,
            })
            this.messenger.sendChatInputEnabled(tabID, false)
            this.messenger.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.featureDev.pillText.selectOption'))
            return
        }

        // Ensure that chat input is enabled so that they can provide additional iterations if they choose
        this.messenger.sendChatInputEnabled(tabID, true)
        this.messenger.sendUpdatePlaceholder(tabID, i18n('AWS.amazonq.featureDev.placeholder.additionalImprovements'))
    }

    private async processAutoBuildSetting(setting: boolean, msg: any) {
        const root = (await this.sessionStorage.getSession(msg.tabID)).getWorkspaceRoot()
        await CodeWhispererSettings.instance.updateAutoBuildSetting(root, setting)

        this.messenger.sendAnswer({
            message: i18n('AWS.amazonq.featureDev.answer.settingUpdated'),
            tabID: msg.tabID,
            type: 'answer',
        })

        await this.retryRequest(msg)
    }

    // TODO add type
    private async insertCode(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

            const acceptedFiles = (paths?: { rejected: boolean }[]) => (paths || []).filter((i) => !i.rejected).length

            const filesAccepted = acceptedFiles(session.state.filePaths) + acceptedFiles(session.state.deletedFiles)

            this.sendAcceptCodeTelemetry(session, filesAccepted)

            await session.insertChanges()

            if (session.acceptCodeMessageId) {
                this.sendUpdateCodeMessage(message.tabID)
                await this.workOnNewTask(
                    message.tabID,
                    session.state.codeGenerationRemainingIterationCount,
                    session.state.codeGenerationTotalIterationCount
                )
                await this.clearAcceptCodeMessageId(message.tabID)
            }
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                createUserFacingErrorMessage(`Failed to insert code changes: ${err.message}`),
                message.tabID,
                this.retriesRemaining(session),
                session?.conversationIdUnsafe
            )
        }
    }

    private async provideFeedbackAndRegenerateCode(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        telemetry.amazonq_isProvideFeedbackForCodeGen.emit({
            amazonqConversationId: session.conversationId,
            enabled: true,
            result: 'Succeeded',
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
        // Unblock the message button
        this.messenger.sendAsyncEventProgress(message.tabID, false, undefined)

        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: i18n('AWS.amazonq.featureDev.answer.howCodeCanBeImproved'),
            canBeVoted: true,
        })

        this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.featureDev.placeholder.feedback'))
    }

    private async retryRequest(message: any) {
        let session
        try {
            this.messenger.sendAsyncEventProgress(message.tabID, true, undefined)

            session = await this.sessionStorage.getSession(message.tabID)

            // Decrease retries before making this request, just in case this one fails as well
            session.decreaseRetries()

            // Sending an empty message will re-run the last state with the previous values
            await this.processUserChatMessage({
                message: session.latestMessage,
                tabID: message.tabID,
            })
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                createUserFacingErrorMessage(`Failed to retry request: ${err.message}`),
                message.tabID,
                this.retriesRemaining(session),
                session?.conversationIdUnsafe
            )
        } finally {
            // Finish processing the event
            this.messenger.sendAsyncEventProgress(message.tabID, false, undefined)
        }
    }

    private async modifyDefaultSourceFolder(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)

        const uri = await createSingleFileDialog({
            canSelectFolders: true,
            canSelectFiles: false,
        }).prompt()

        let metricData: { result: 'Succeeded' } | { result: 'Failed'; reason: string } | undefined

        if (!(uri instanceof vscode.Uri)) {
            this.messenger.sendAnswer({
                tabID: message.tabID,
                type: 'system-prompt',
                followUps: [
                    {
                        pillText: i18n('AWS.amazonq.featureDev.pillText.selectFiles'),
                        type: 'ModifyDefaultSourceFolder',
                        status: 'info',
                    },
                ],
            })
            metricData = { result: 'Failed', reason: 'ClosedBeforeSelection' }
        } else if (!vscode.workspace.getWorkspaceFolder(uri)) {
            this.messenger.sendAnswer({
                tabID: message.tabID,
                type: 'answer',
                message: new SelectedFolderNotInWorkspaceFolderError().message,
                canBeVoted: true,
            })
            this.messenger.sendAnswer({
                tabID: message.tabID,
                type: 'system-prompt',
                followUps: [
                    {
                        pillText: i18n('AWS.amazonq.featureDev.pillText.selectFiles'),
                        type: 'ModifyDefaultSourceFolder',
                        status: 'info',
                    },
                ],
            })
            metricData = { result: 'Failed', reason: 'NotInWorkspaceFolder' }
        } else {
            session.updateWorkspaceRoot(uri.fsPath)
            metricData = { result: 'Succeeded' }
            this.messenger.sendAnswer({
                message: `Changed source root to: ${uri.fsPath}`,
                type: 'answer',
                tabID: message.tabID,
                canBeVoted: true,
            })
            this.messenger.sendAnswer({
                message: undefined,
                type: 'system-prompt',
                followUps: [
                    {
                        pillText: i18n('AWS.amazonq.featureDev.pillText.retry'),
                        type: FollowUpTypes.Retry,
                        status: 'warning',
                    },
                ],
                tabID: message.tabID,
            })
            this.messenger.sendChatInputEnabled(message.tabID, true)
            this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.featureDev.pillText.writeNewPrompt'))
        }

        telemetry.amazonq_modifySourceFolder.emit({
            credentialStartUrl: AuthUtil.instance.startUrl,
            amazonqConversationId: session.conversationId,
            ...metricData,
        })
    }

    private initialExamples(message: any) {
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: examples,
            canBeVoted: true,
        })
    }

    private async fileClicked(message: fileClickedMessage) {
        // TODO: add Telemetry here
        const tabId: string = message.tabID
        const messageId = message.messageId
        const filePathToUpdate: string = message.filePath
        const action = message.actionName

        const session = await this.sessionStorage.getSession(tabId)
        const filePathIndex = (session.state.filePaths ?? []).findIndex((obj) => obj.relativePath === filePathToUpdate)
        const deletedFilePathIndex = (session.state.deletedFiles ?? []).findIndex(
            (obj) => obj.relativePath === filePathToUpdate
        )

        if (filePathIndex !== -1 && session.state.filePaths) {
            if (action === 'accept-change') {
                this.sendAcceptCodeTelemetry(session, 1)
                await session.insertNewFiles([session.state.filePaths[filePathIndex]])
                await session.insertCodeReferenceLogs(session.state.references ?? [])
                await this.openFile(session.state.filePaths[filePathIndex], tabId)
            } else {
                session.state.filePaths[filePathIndex].rejected = !session.state.filePaths[filePathIndex].rejected
            }
        }
        if (deletedFilePathIndex !== -1 && session.state.deletedFiles) {
            if (action === 'accept-change') {
                this.sendAcceptCodeTelemetry(session, 1)
                await session.applyDeleteFiles([session.state.deletedFiles[deletedFilePathIndex]])
                await session.insertCodeReferenceLogs(session.state.references ?? [])
            } else {
                session.state.deletedFiles[deletedFilePathIndex].rejected =
                    !session.state.deletedFiles[deletedFilePathIndex].rejected
            }
        }

        await session.updateFilesPaths({
            tabID: tabId,
            filePaths: session.state.filePaths ?? [],
            deletedFiles: session.state.deletedFiles ?? [],
            messageId,
        })

        if (session.acceptCodeMessageId) {
            const allFilePathsAccepted = session.state.filePaths?.every(
                (filePath: NewFileInfo) => !filePath.rejected && filePath.changeApplied
            )
            const allDeletedFilePathsAccepted = session.state.deletedFiles?.every(
                (filePath: DeletedFileInfo) => !filePath.rejected && filePath.changeApplied
            )
            if (allFilePathsAccepted && allDeletedFilePathsAccepted) {
                this.sendUpdateCodeMessage(tabId)
                await this.workOnNewTask(
                    tabId,
                    session.state.codeGenerationRemainingIterationCount,
                    session.state.codeGenerationTotalIterationCount
                )
                await this.clearAcceptCodeMessageId(tabId)
            }
        }
    }

    private async storeCodeResultMessageId(message: StoreMessageIdMessage) {
        const tabId: string = message.tabID
        const messageId = message.messageId
        const session = await this.sessionStorage.getSession(tabId)

        session.updateCodeResultMessageId(messageId)
    }

    private async openDiff(message: OpenDiffMessage) {
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

    private async openFile(filePath: NewFileInfo, tabId: string) {
        const leftPath = path.join(filePath.workspaceFolder.uri.fsPath, filePath.relativePath)
        const rightPath = filePath.virtualMemoryUri.path
        await openDiff(leftPath, rightPath, tabId, this.scheme)
    }

    private async stopResponse(message: any) {
        telemetry.ui_click.emit({ elementId: 'amazonq_stopCodeGeneration' })
        this.messenger.sendAnswer({
            message: i18n('AWS.amazonq.featureDev.pillText.stoppingCodeGeneration'),
            type: 'answer-part',
            tabID: message.tabID,
        })
        this.messenger.sendUpdatePlaceholder(
            message.tabID,
            i18n('AWS.amazonq.featureDev.pillText.stoppingCodeGeneration')
        )
        this.messenger.sendChatInputEnabled(message.tabID, false)

        const session = await this.sessionStorage.getSession(message.tabID)
        if (session.state?.tokenSource) {
            session.state?.tokenSource?.cancel()
        }
    }

    private async tabOpened(message: any) {
        let session: Session | undefined
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            getLogger().debug(`${featureName}: Session created with id: ${session.tabID}`)

            const authState = await AuthUtil.instance.getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                void this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }
        } catch (err: any) {
            if (err instanceof WorkspaceFolderNotFoundError) {
                this.messenger.sendAnswer({
                    type: 'answer',
                    tabID: message.tabID,
                    message: err.message,
                })
                this.messenger.sendChatInputEnabled(message.tabID, false)
            } else {
                this.messenger.sendErrorMessage(
                    createUserFacingErrorMessage(err.message),
                    message.tabID,
                    this.retriesRemaining(session),
                    session?.conversationIdUnsafe
                )
            }
        }
    }

    private authClicked(message: any) {
        this.authController.handleAuth(message.authType)

        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: i18n('AWS.amazonq.featureDev.pillText.reauthenticate'),
        })

        // Explicitly ensure the user goes through the re-authenticate flow
        this.messenger.sendChatInputEnabled(message.tabID, false)
    }

    private tabClosed(message: any) {
        this.sessionStorage.deleteSession(message.tabID)
    }

    private async newTask(message: any, prefilledPrompt?: string) {
        // Old session for the tab is ending, delete it so we can create a new one for the message id
        const session = await this.sessionStorage.getSession(message.tabID)
        await session.disableFileList()
        telemetry.amazonq_endChat.emit({
            amazonqConversationId: session.conversationId,
            amazonqEndOfTheConversationLatency: performance.now() - session.telemetry.sessionStartTime,
            result: 'Succeeded',
        })
        this.sessionStorage.deleteSession(message.tabID)

        // Re-run the opening flow, where we check auth + create a session
        await this.tabOpened(message)

        if (prefilledPrompt) {
            await this.processUserChatMessage({ ...message, message: prefilledPrompt })
        } else {
            this.messenger.sendChatInputEnabled(message.tabID, true)
            this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.featureDev.placeholder.describe'))
        }
    }

    private async closeSession(message: any) {
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: i18n('AWS.amazonq.featureDev.answer.sessionClosed'),
        })
        this.messenger.sendUpdatePlaceholder(message.tabID, i18n('AWS.amazonq.featureDev.placeholder.sessionClosed'))
        this.messenger.sendChatInputEnabled(message.tabID, false)

        const session = await this.sessionStorage.getSession(message.tabID)
        await session.disableFileList()
        telemetry.amazonq_endChat.emit({
            amazonqConversationId: session.conversationId,
            amazonqEndOfTheConversationLatency: performance.now() - session.telemetry.sessionStartTime,
            result: 'Succeeded',
        })
    }

    private sendFeedback() {
        void submitFeedback(placeholder, 'Amazon Q')
    }

    private processLink(message: any) {
        void openUrl(vscode.Uri.parse(message.link))
    }

    private insertCodeAtPosition(message: any) {
        this.contentController.insertTextAtCursorPosition(message.code, () => {})
    }

    private retriesRemaining(session: Session | undefined) {
        return session?.retries ?? defaultRetryLimit
    }

    private async clearAcceptCodeMessageId(tabID: string) {
        const session = await this.sessionStorage.getSession(tabID)
        session.updateAcceptCodeMessageId(undefined)
    }

    private sendAcceptCodeTelemetry(session: Session, amazonqNumberOfFilesAccepted: number) {
        // accepted code telemetry is only to be sent once per iteration of code generation
        if (amazonqNumberOfFilesAccepted > 0 && !session.acceptCodeTelemetrySent) {
            session.updateAcceptCodeTelemetrySent(true)
            telemetry.amazonq_isAcceptedCodeChanges.emit({
                credentialStartUrl: AuthUtil.instance.startUrl,
                amazonqConversationId: session.conversationId,
                amazonqNumberOfFilesAccepted,
                enabled: true,
                result: 'Succeeded',
            })
        }
    }
}
