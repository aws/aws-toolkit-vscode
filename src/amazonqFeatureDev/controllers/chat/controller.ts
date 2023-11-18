/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemFollowUp, MynahIcons } from '@aws/mynah-ui-chat'
import { existsSync } from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { EventEmitter } from 'vscode'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { createSingleFileDialog } from '../../../shared/ui/common/openDialog'
import { featureDevScheme } from '../../constants'
import { SelectedFolderNotInWorkspaceFolderError, createUserFacingErrorMessage } from '../../errors'
import { defaultRetryLimit } from '../../limits'
import { Session } from '../../session/session'
import { featureName } from '../../constants'
import { ChatSessionStorage } from '../../storages/chatSession'
import { FollowUpTypes, SessionStatePhase } from '../../types'
import { Messenger } from './messenger/messenger'
import { getChatAuthState } from '../../../codewhisperer/util/authUtil'
import { AuthController } from '../../../amazonq/auth/controller'

export interface ChatControllerEventEmitters {
    readonly processHumanChatMessage: EventEmitter<any>
    readonly followUpClicked: EventEmitter<any>
    readonly openDiff: EventEmitter<any>
    readonly stopResponse: EventEmitter<any>
    readonly tabOpened: EventEmitter<any>
    readonly tabClosed: EventEmitter<any>
    readonly processChatItemVotedMessage: EventEmitter<any>
    readonly authClicked: EventEmitter<any>
}

type OpenDiffMessage = { tabID: string; messageId: string; filePath: string; deleted: boolean }
export class FeatureDevController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionStorage
    private isAmazonQVisible: boolean
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

        /**
         * defaulted to true because onDidChangeAmazonQVisibility doesn't get fire'd until after
         * the view is opened
         */
        this.isAmazonQVisible = true

        onDidChangeAmazonQVisibility(visible => {
            this.isAmazonQVisible = visible
        })

        this.chatControllerMessageListeners.processHumanChatMessage.event(data => {
            this.processUserChatMessage(data)
        })
        this.chatControllerMessageListeners.processChatItemVotedMessage.event(data => {
            this.processChatItemVotedMessage(data.tabID, data.messageId, data.vote)
        })
        this.chatControllerMessageListeners.followUpClicked.event(data => {
            switch (data.followUp.type) {
                case FollowUpTypes.WriteCode:
                    this.writeCodeClicked(data)
                    break
                case FollowUpTypes.AcceptCode:
                    this.acceptCode(data)
                    break
                case FollowUpTypes.ProvideFeedbackAndRegenerateCode:
                    this.provideFeedbackAndRegenerateCode(data)
                    break
                case FollowUpTypes.Retry:
                    this.retryRequest(data)
                    break
                case FollowUpTypes.ModifyDefaultSourceFolder:
                    this.modifyDefaultSourceFolder(data)
                    break
                case FollowUpTypes.DevExamples:
                    this.initialExamples(data)
                    break
                case FollowUpTypes.NewTask:
                    this.newTask(data)
                    break
                case FollowUpTypes.CloseSession:
                    this.closeSession(data)
                    break
            }
        })
        this.chatControllerMessageListeners.openDiff.event(data => {
            this.openDiff(data)
        })
        this.chatControllerMessageListeners.stopResponse.event(data => {
            this.stopResponse(data)
        })
        this.chatControllerMessageListeners.tabOpened.event(data => {
            this.tabOpened(data)
        })
        this.chatControllerMessageListeners.tabClosed.event(data => {
            this.tabClosed(data)
        })
        this.chatControllerMessageListeners.authClicked.event(data => {
            this.authClicked(data)
        })
    }

    private async processChatItemVotedMessage(tabId: string, messageId: string, vote: string) {
        const session = await this.sessionStorage.getSession(tabId)

        switch (session?.state.phase) {
            case 'Approach':
                if (vote === 'upvote') {
                    telemetry.amazonq_approachThumbsUp.emit({
                        amazonqConversationId: session?.conversationId,
                        value: 1,
                    })
                } else if (vote === 'downvote') {
                    telemetry.amazonq_approachThumbsDown.emit({
                        amazonqConversationId: session?.conversationId,
                        value: 1,
                    })
                }
                break
            case 'Codegen':
                if (vote === 'upvote') {
                    telemetry.amazonq_codeGenerationThumbsUp.emit({
                        amazonqConversationId: session?.conversationId,
                        value: 1,
                    })
                } else if (vote === 'downvote') {
                    telemetry.amazonq_codeGenerationThumbsDown.emit({
                        amazonqConversationId: session?.conversationId,
                        value: 1,
                    })
                }
                break
        }
    }

    // TODO add type
    private async processUserChatMessage(message: any) {
        if (message.message === undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID, 0, undefined)
            return
        }

        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

            const authState = getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }

            switch (session.state.phase) {
                case 'Init':
                case 'Approach':
                    await this.onApproachGeneration(session, message.message, message.tabID)
                    break
                case 'Codegen':
                    await this.onCodeGeneration(session, message.message, message.tabID)
                    break
            }
        } catch (err: any) {
            const errorMessage = createUserFacingErrorMessage(
                `${featureName} request failed: ${err.cause?.message ?? err.message}`
            )
            this.messenger.sendErrorMessage(
                errorMessage,
                message.tabID,
                this.retriesRemaining(session),
                session?.state.phase
            )

            // Lock the chat input until they explicitly click one of the follow ups
            this.messenger.sendChatInputEnabled(message.tabID, false)
        }
    }

    /**
     * Handle a regular incoming message when a user is in the approach phase
     */
    private async onApproachGeneration(session: Session, message: string, tabID: string) {
        await session.preloader(message)

        // Ensure that the loading icon stays showing
        this.messenger.sendAsyncEventProgress(tabID, true, 'Ok, let me create a plan. This may take a few minutes.')

        this.messenger.sendUpdatePlaceholder(tabID, 'Generating approach ...')
        const interactions = await session.send(message)
        this.messenger.sendUpdatePlaceholder(tabID, 'Add more detail to iterate on the approach')

        // Resolve the "..." with the content
        this.messenger.sendAnswer({
            message: interactions.content,
            type: 'answer-part',
            tabID: tabID,
            canBeVoted: true,
        })

        this.messenger.sendAnswer({
            type: 'answer',
            tabID,
            message:
                'Would you like me to generate a suggestion for this? You will be able to review a file diff before inserting code in your project.',
        })

        // Follow up with action items and complete the request stream
        this.messenger.sendAnswer({
            type: 'system-prompt', // show the followups on the right side
            followUps: this.getFollowUpOptions(session.state.phase),
            tabID: tabID,
        })

        // Unlock the prompt again so that users can iterate
        this.messenger.sendAsyncEventProgress(tabID, false, undefined)
    }

    /**
     * Handle a regular incoming message when a user is in the code generation phase
     */
    private async onCodeGeneration(session: Session, message: string, tabID: string) {
        // lock the UI/show loading bubbles
        this.messenger.sendAsyncEventProgress(
            tabID,
            true,
            `This may take a few minutes. I will send a notification when it's complete if you navigate away from this panel`
        )

        try {
            this.messenger.sendAnswer({
                message: 'Requesting changes ...',
                type: 'answer-stream',
                tabID,
            })
            this.messenger.sendUpdatePlaceholder(tabID, 'Writing code ...')
            await session.send(message)
            const filePaths = session.state.filePaths ?? []
            const deletedFiles = session.state.deletedFiles ?? []
            if (filePaths.length === 0 && deletedFiles.length === 0) {
                this.messenger.sendAnswer({
                    message: 'Unable to generate any file changes',
                    type: 'answer',
                    tabID: tabID,
                })
                this.messenger.sendAnswer({
                    type: 'system-prompt',
                    tabID: tabID,
                    followUps:
                        this.retriesRemaining(session) > 0
                            ? [
                                  {
                                      pillText: 'Retry',
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

            // Only add the follow up accept/deny buttons when the tab hasn't been closed/request hasn't been cancelled
            if (session?.state.tokenSource.token.isCancellationRequested) {
                return
            }

            this.messenger.sendCodeResult(
                filePaths,
                deletedFiles,
                session.state.references ?? [],
                tabID,
                session.uploadId
            )
            this.messenger.sendAnswer({
                message: undefined,
                type: 'system-prompt',
                followUps: this.getFollowUpOptions(session?.state.phase),
                tabID: tabID,
            })
            this.messenger.sendUpdatePlaceholder(tabID, 'Select an option above to proceed')
        } finally {
            // Finish processing the event
            this.messenger.sendAsyncEventProgress(tabID, false, undefined)

            // Lock the chat input until they explicitly click one of the follow ups
            this.messenger.sendChatInputEnabled(tabID, false)

            if (!this.isAmazonQVisible) {
                const open = 'Open chat'
                const resp = await vscode.window.showInformationMessage(
                    'Your code suggestions from Amazon Q (Preview) are ready to review',
                    open
                )
                if (resp === open) {
                    await vscode.commands.executeCommand('aws.AmazonQChatView.focus')
                    // TODO add focusing on the specific tab once that's implemented
                }
            }
        }
    }

    // TODO add type
    private async writeCodeClicked(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            session.initCodegen()
            await this.onCodeGeneration(session, '', message.tabID)
        } catch (err: any) {
            const errorMessage = createUserFacingErrorMessage(
                `${featureName} request failed: ${err.cause?.message ?? err.message}`
            )
            this.messenger.sendErrorMessage(
                errorMessage,
                message.tabID,
                this.retriesRemaining(session),
                session?.state.phase
            )
        }
    }

    // TODO add type
    private async acceptCode(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            telemetry.amazonq_isAcceptedCodeChanges.emit({
                amazonqConversationId: session.conversationId,
                enabled: true,
            })
            await session.acceptChanges()

            this.messenger.sendAnswer({
                type: 'answer',
                tabID: message.tabID,
                message: 'Code has been updated. Would you like to work on another task?',
            })

            this.messenger.sendAnswer({
                type: 'system-prompt',
                tabID: message.tabID,
                followUps: [
                    {
                        pillText: 'Work on new task',
                        type: FollowUpTypes.NewTask,
                        status: 'info',
                    },
                    {
                        pillText: 'Close session',
                        type: FollowUpTypes.CloseSession,
                        status: 'info',
                    },
                ],
            })

            // Ensure that chat input is disabled until they click a followup
            this.messenger.sendChatInputEnabled(message.tabID, false)
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                createUserFacingErrorMessage(`Failed to accept code changes: ${err.message}`),
                message.tabID,
                this.retriesRemaining(session),
                session?.state.phase
            )
        }
    }

    private async provideFeedbackAndRegenerateCode(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        telemetry.amazonq_isProvideFeedbackForCodeGen.emit({
            amazonqConversationId: session.conversationId,
            enabled: true,
        })
        // Unblock the message button
        this.messenger.sendAsyncEventProgress(message.tabID, false, undefined)

        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: 'How can the code be improved?',
        })

        this.messenger.sendUpdatePlaceholder(message.tabID, 'Feedback, comments ...')
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
                session?.state.phase
            )
        } finally {
            // Finish processing the event
            this.messenger.sendAsyncEventProgress(message.tabID, false, undefined)

            // Lock the chat input until they explicitly click one of the follow ups
            this.messenger.sendChatInputEnabled(message.tabID, false)
        }
    }

    private getFollowUpOptions(phase: SessionStatePhase | undefined): ChatItemFollowUp[] {
        switch (phase) {
            case 'Approach':
                return [
                    {
                        pillText: 'Write Code',
                        type: FollowUpTypes.WriteCode,
                        status: 'info',
                    },
                ]
            case 'Codegen':
                return [
                    {
                        pillText: 'Accept changes',
                        type: FollowUpTypes.AcceptCode,
                        icon: 'ok' as MynahIcons,
                        status: 'success',
                    },
                    {
                        pillText: 'Provide feedback & regenerate',
                        type: FollowUpTypes.ProvideFeedbackAndRegenerateCode,
                        icon: 'refresh' as MynahIcons,
                        status: 'info',
                    },
                ]
            default:
                return []
        }
    }

    private async modifyDefaultSourceFolder(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)

        const uri = await createSingleFileDialog({
            defaultUri: vscode.Uri.file(session.config.workspaceRoot),
            canSelectFolders: true,
            canSelectFiles: false,
        }).prompt()

        if (uri instanceof vscode.Uri && !vscode.workspace.getWorkspaceFolder(uri)) {
            this.messenger.sendAnswer({
                tabID: message.tabID,
                type: 'answer',
                followUps: [
                    {
                        pillText: 'Modify source folder',
                        type: 'ModifyDefaultSourceFolder',
                    },
                ],
                message: new SelectedFolderNotInWorkspaceFolderError().message,
            })
            return
        }

        if (uri && uri instanceof vscode.Uri) {
            session.config.sourceRoot = uri.fsPath
            this.messenger.sendAnswer({
                message: `Changed source root to: ${session.config.sourceRoot}`,
                type: 'answer',
                tabID: message.tabID,
            })
        }
    }

    private initialExamples(message: any) {
        const examples = `
You can use /dev to:
- Add a new feature or logic
- Write tests 
- Fix a bug in your project
- Generate a README for a file, folder, or project

To learn more, visit the _Amazon Q User Guide_.
`
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: examples,
        })
    }

    private getOriginalFileUri({ filePath, tabID }: OpenDiffMessage, session: Session) {
        const originalPath = path.join(session.config.workspaceRoot, filePath)
        return existsSync(originalPath)
            ? vscode.Uri.file(originalPath)
            : vscode.Uri.from({ scheme: featureDevScheme, path: 'empty', query: `tabID=${tabID}` })
    }

    private getFileDiffUris(message: OpenDiffMessage, session: Session) {
        const left = this.getOriginalFileUri(message, session)
        const right = vscode.Uri.from({
            scheme: featureDevScheme,
            path: path.join(session.uploadId, message.filePath!),
            query: `tabID=${message.tabID}`,
        })

        return { left, right }
    }

    private async openDiff(message: OpenDiffMessage) {
        const session = await this.sessionStorage.getSession(message.tabID)
        telemetry.amazonq_isReviewedChanges.emit({ amazonqConversationId: session.conversationId, enabled: true })

        if (message.deleted) {
            const fileUri = this.getOriginalFileUri(message, session)
            const basename = path.basename(message.filePath)
            vscode.commands.executeCommand('vscode.open', fileUri, {}, `${basename} (Deleted)`)
        } else {
            const { left, right } = this.getFileDiffUris(message, session)
            vscode.commands.executeCommand('vscode.diff', left, right)
        }
    }

    private async stopResponse(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        session.state.tokenSource.cancel()
    }

    private async tabOpened(message: any) {
        let session: Session | undefined
        try {
            session = await this.sessionStorage.createSession(message.tabID)

            const authState = getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
                session.isAuthenticating = true
                return
            }
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                createUserFacingErrorMessage(err.message),
                message.tabID,
                this.retriesRemaining(session),
                session?.state.phase
            )
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

    private async newTask(message: any) {
        const tabOpenedMessage = 'A new tab has been opened.'
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: tabOpenedMessage,
        })
        this.messenger.openNewTask()
        this.messenger.sendUpdatePlaceholder(message.tabID, tabOpenedMessage)
        this.messenger.sendChatInputEnabled(message.tabID, false)

        const session = await this.sessionStorage.getSession(message.tabID)
        telemetry.amazonq_endChat.emit({
            amazonqConversationId: session.conversationId,
            amazonqEndOfTheConversationLatency: performance.now() - session.telemetry.sessionStartTime,
        })
    }

    private async closeSession(message: any) {
        const closedMessage = 'Your session is now closed.'
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: closedMessage,
        })
        this.messenger.sendUpdatePlaceholder(message.tabID, closedMessage)
        this.messenger.sendChatInputEnabled(message.tabID, false)

        const session = await this.sessionStorage.getSession(message.tabID)
        telemetry.amazonq_endChat.emit({
            amazonqConversationId: session.conversationId,
            amazonqEndOfTheConversationLatency: performance.now() - session.telemetry.sessionStartTime,
        })
    }

    private retriesRemaining(session: Session | undefined) {
        return session?.retries ?? defaultRetryLimit
    }
}
