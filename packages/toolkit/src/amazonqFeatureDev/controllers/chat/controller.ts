/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemAction, MynahIcons } from '@aws/mynah-ui'
import { existsSync } from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { EventEmitter } from 'vscode'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { createSingleFileDialog } from '../../../shared/ui/common/openDialog'
import { featureDevScheme } from '../../constants'
import { ContentLengthError, SelectedFolderNotInWorkspaceFolderError, createUserFacingErrorMessage } from '../../errors'
import { defaultRetryLimit } from '../../limits'
import { Session } from '../../session/session'
import { featureName } from '../../constants'
import { ChatSessionStorage } from '../../storages/chatSession'
import { FollowUpTypes, SessionStatePhase } from '../../types'
import { Messenger } from './messenger/messenger'
import { AuthUtil, getChatAuthState } from '../../../codewhisperer/util/authUtil'
import { AuthController } from '../../../amazonq/auth/controller'
import { getLogger } from '../../../shared/logger'
import { submitFeedback } from '../../../feedback/vue/submitFeedback'
import { placeholder } from '../../../shared/vscode/commands2'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'
import { openUrl } from '../../../shared/utilities/vsCodeUtils'
import { getPathsFromZipFilePath, getWorkspaceFoldersByPrefixes } from '../../util/files'
import { userGuideURL } from '../../../amazonq/webview/ui/texts/constants'

export interface ChatControllerEventEmitters {
    readonly processHumanChatMessage: EventEmitter<any>
    readonly followUpClicked: EventEmitter<any>
    readonly openDiff: EventEmitter<any>
    readonly stopResponse: EventEmitter<any>
    readonly tabOpened: EventEmitter<any>
    readonly tabClosed: EventEmitter<any>
    readonly processChatItemVotedMessage: EventEmitter<any>
    readonly authClicked: EventEmitter<any>
    readonly processResponseBodyLinkClick: EventEmitter<any>
    readonly insertCodeAtPositionClicked: EventEmitter<any>
}

type OpenDiffMessage = {
    tabID: string
    messageId: string
    // currently the zip file path
    filePath: string
    deleted: boolean
}
export class FeatureDevController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionStorage
    private isAmazonQVisible: boolean
    private authController: AuthController
    private contentController: EditorContentController

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: Messenger,
        sessionStorage: ChatSessionStorage,
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

        onDidChangeAmazonQVisibility(visible => {
            this.isAmazonQVisible = visible
        })

        this.chatControllerMessageListeners.processHumanChatMessage.event(data => {
            this.processUserChatMessage(data).catch(e => {
                getLogger().error('processUserChatMessage failed: %s', (e as Error).message)
            })
        })
        this.chatControllerMessageListeners.processChatItemVotedMessage.event(data => {
            this.processChatItemVotedMessage(data.tabID, data.messageId, data.vote).catch(e => {
                getLogger().error('processChatItemVotedMessage failed: %s', (e as Error).message)
            })
        })
        this.chatControllerMessageListeners.followUpClicked.event(data => {
            switch (data.followUp.type) {
                case FollowUpTypes.WriteCode:
                    return this.writeCodeClicked(data)
                case FollowUpTypes.AcceptCode:
                    return this.acceptCode(data)
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
                    return this.newTask(data)
                case FollowUpTypes.CloseSession:
                    return this.closeSession(data)
                case FollowUpTypes.SendFeedback:
                    this.sendFeedback()
                    break
            }
        })
        this.chatControllerMessageListeners.openDiff.event(data => {
            return this.openDiff(data)
        })
        this.chatControllerMessageListeners.stopResponse.event(data => {
            return this.stopResponse(data)
        })
        this.chatControllerMessageListeners.tabOpened.event(data => {
            return this.tabOpened(data)
        })
        this.chatControllerMessageListeners.tabClosed.event(data => {
            this.tabClosed(data)
        })
        this.chatControllerMessageListeners.authClicked.event(data => {
            this.authClicked(data)
        })
        this.chatControllerMessageListeners.processResponseBodyLinkClick.event(data => {
            this.processLink(data)
        })
        this.chatControllerMessageListeners.insertCodeAtPositionClicked.event(data => {
            this.insertCodeAtPosition(data)
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
                        result: 'Succeeded',
                        credentialStartUrl: AuthUtil.instance.startUrl,
                    })
                } else if (vote === 'downvote') {
                    telemetry.amazonq_approachThumbsDown.emit({
                        amazonqConversationId: session?.conversationId,
                        value: 1,
                        result: 'Succeeded',
                        credentialStartUrl: AuthUtil.instance.startUrl,
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

            const authState = await getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                await this.messenger.sendAuthNeededExceptionMessage(authState, message.tabID)
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
            if (err instanceof ContentLengthError) {
                this.messenger.sendErrorMessage(err.message, message.tabID, this.retriesRemaining(session))
                this.messenger.sendAnswer({
                    type: 'system-prompt',
                    tabID: message.tabID,
                    followUps: [
                        {
                            pillText: 'Select files for context',
                            type: 'ModifyDefaultSourceFolder',
                            status: 'info',
                        },
                    ],
                })
            } else {
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

        this.messenger.sendUpdatePlaceholder(tabID, 'Generating implementation plan ...')

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
                    'Your code suggestions from Amazon Q are ready to review',
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

            // Ensure that chat input is enabled so that they can provide additional iterations if they choose
            this.messenger.sendChatInputEnabled(message.tabID, true)
            this.messenger.sendUpdatePlaceholder(message.tabID, 'Provide input on additional improvements')
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

    private getFollowUpOptions(phase: SessionStatePhase | undefined): ChatItemAction[] {
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
            canSelectFolders: true,
            canSelectFiles: false,
        }).prompt()

        if (uri instanceof vscode.Uri && !vscode.workspace.getWorkspaceFolder(uri)) {
            this.messenger.sendAnswer({
                tabID: message.tabID,
                type: 'answer',
                message: new SelectedFolderNotInWorkspaceFolderError().message,
            })
            this.messenger.sendAnswer({
                tabID: message.tabID,
                type: 'system-prompt',
                followUps: [
                    {
                        pillText: 'Select files for context',
                        type: 'ModifyDefaultSourceFolder',
                        status: 'info',
                    },
                ],
            })
            return
        }

        if (uri && uri instanceof vscode.Uri) {
            session.config.sourceRoots = [uri.fsPath]
            this.messenger.sendAnswer({
                message: `Changed source root to: ${uri.fsPath}`,
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

To learn more, visit the _[Amazon Q User Guide](${userGuideURL})_.
`
        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: examples,
        })
    }

    private getOriginalFileUri(fullPath: string, tabID: string) {
        const originalPath = fullPath
        return existsSync(originalPath)
            ? vscode.Uri.file(originalPath)
            : vscode.Uri.from({ scheme: featureDevScheme, path: 'empty', query: `tabID=${tabID}` })
    }

    private getFileDiffUris(zipFilePath: string, fullFilePath: string, tabId: string, session: Session) {
        const left = this.getOriginalFileUri(fullFilePath, tabId)
        const right = vscode.Uri.from({
            scheme: featureDevScheme,
            path: path.join(session.uploadId, zipFilePath),
            query: `tabID=${tabId}`,
        })

        return { left, right }
    }

    private async openDiff(message: OpenDiffMessage) {
        const tabId: string = message.tabID
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
            const fileUri = this.getOriginalFileUri(pathInfos.absolutePath, tabId)
            const basename = path.basename(pathInfos.relativePath)
            await vscode.commands.executeCommand('vscode.open', fileUri, {}, `${basename} (Deleted)`)
        } else {
            const { left, right } = this.getFileDiffUris(zipFilePath, pathInfos.absolutePath, tabId, session)
            await vscode.commands.executeCommand('vscode.diff', left, right)
        }
    }

    private async stopResponse(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        session.state.tokenSource.cancel()
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
        // Old session for the tab is ending, delete it so we can create a new one for the message id
        await this.closeSession(message)
        this.sessionStorage.deleteSession(message.tabID)

        // Re-run the opening flow, where we check auth + create a session
        await this.tabOpened(message)

        this.messenger.sendAnswer({
            type: 'answer',
            tabID: message.tabID,
            message: 'What change would you like to make?',
        })
        this.messenger.sendUpdatePlaceholder(message.tabID, 'Briefly describe a task or issue')
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
            result: 'Succeeded',
        })
    }

    private sendFeedback() {
        void submitFeedback.execute(placeholder, 'Amazon Q')
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
}
