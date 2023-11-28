/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemFollowUp } from '@aws/mynah-ui-chat'
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
import { MessengerFactory } from './messenger/messenger'
import { getChatAuthState } from '../../../codewhisperer/util/authUtil'
import { AuthController } from '../../../amazonq/auth/controller'
import { getLogger } from '../../../shared/logger'
import { submitFeedback } from '../../../feedback/vue/submitFeedback'
import { placeholder } from '../../../shared/vscode/commands2'
import { ExternalBrowserUtils } from '../../../amazonq/commons/externalBrowser/externalBrowserUtils'
import { userGuideURL } from '../../../amazonq/webview/ui/texts/constants'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'

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

type OpenDiffMessage = { tabID: string; messageId: string; filePath: string; deleted: boolean }
export class FeatureDevController {
    private readonly sessionStorage: ChatSessionStorage
    private authController: AuthController
    private contentController: EditorContentController

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        private readonly messengerFactory: MessengerFactory,
        sessionStorage: ChatSessionStorage,
        onDidChangeAmazonQVisibility: vscode.Event<boolean>
    ) {
        this.sessionStorage = sessionStorage
        this.authController = new AuthController()
        this.contentController = new EditorContentController()

        this.chatControllerMessageListeners.processHumanChatMessage.event(data => {
            this.processUserChatMessage(data)
        })
        this.chatControllerMessageListeners.processChatItemVotedMessage.event(data => {
            this.processChatItemVotedMessage(data.tabID, data.messageId, data.vote)
        })
        this.chatControllerMessageListeners.followUpClicked.event(data => {
            switch (data.followUp.type) {
                case FollowUpTypes.Retry:
                    this.retryRequest(data)
                    break
                case FollowUpTypes.ModifyDefaultSourceFolder:
                    this.modifyDefaultSourceFolder(data)
                    break
                case FollowUpTypes.DevExamples:
                    this.initialExamples(data)
                    break
                case FollowUpTypes.NewPlan:
                    this.newPlan(data)
                    break
                case FollowUpTypes.SendFeedback:
                    this.sendFeedback()
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
                    })
                } else if (vote === 'downvote') {
                    telemetry.amazonq_approachThumbsDown.emit({
                        amazonqConversationId: session?.conversationId,
                        value: 1,
                    })
                }
                break
        }
    }

    // TODO add type
    private async processUserChatMessage(message: any) {
        const messenger = this.messengerFactory(message.tabID)

        if (message.message === undefined) {
            messenger.sendErrorMessage('chatMessage should be set', 0)
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
                messenger.sendAuthNeededExceptionMessage(authState)
                session.isAuthenticating = true
                return
            }

            switch (session.state.phase) {
                case 'Init':
                case 'Approach':
                    await this.onApproachGeneration(session, message.message, message.tabID)
                    break
            }
        } catch (err: any) {
            if (err instanceof ContentLengthError) {
                messenger.sendErrorMessage(err.message, this.retriesRemaining(session))
                messenger.sendSystemPrompt({
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
                messenger.sendErrorMessage(errorMessage, this.retriesRemaining(session), session?.state.phase)
            }

            // Lock the chat input until they explicitly click one of the follow ups
            messenger.sendChatInputEnabled(false)
        }
    }

    /**
     * Handle a regular incoming message when a user is in the approach phase
     */
    private async onApproachGeneration(session: Session, message: string, tabID: string) {
        await session.preloader(message)

        const messenger = this.messengerFactory(tabID)

        messenger.sendAnswer({
            message: 'Ok, let me create a plan. This may take a few minutes.',
        })

        // Ensure that the loading icon stays showing
        messenger.sendAsyncEventProgress(true, undefined)

        messenger.sendUpdatePlaceholder('Generating implementation plan ...')
        const interactions = await session.send(message)
        messenger.sendUpdatePlaceholder('Add more detail to iterate on the implementation plan')

        // Resolve the "..." with the content
        messenger.sendAnswerPart({
            message: interactions.content,
            canBeVoted: true,
        })

        // Follow up with action items on right side and complete the request stream
        messenger.sendSystemPrompt({
            followUps: this.getFollowUpOptions(session.state.phase),
        })

        // Unlock the prompt again so that users can iterate
        messenger.sendAsyncEventProgress(false, undefined)
    }

    private async retryRequest(message: any) {
        const messenger = this.messengerFactory(message.tabID)

        let session
        try {
            messenger.sendAsyncEventProgress(true, undefined)

            session = await this.sessionStorage.getSession(message.tabID)

            // Decrease retries before making this request, just in case this one fails as well
            session.decreaseRetries()

            // Sending an empty message will re-run the last state with the previous values
            await this.processUserChatMessage({
                message: session.latestMessage,
                tabID: message.tabID,
            })
        } catch (err: any) {
            messenger.sendErrorMessage(
                createUserFacingErrorMessage(`Failed to retry request: ${err.message}`),
                this.retriesRemaining(session),
                session?.state.phase
            )
        } finally {
            // Finish processing the event
            messenger.sendAsyncEventProgress(false, undefined)

            // Lock the chat input until they explicitly click one of the follow ups
            messenger.sendChatInputEnabled(false)
        }
    }

    private getFollowUpOptions(phase: SessionStatePhase | undefined): ChatItemFollowUp[] {
        switch (phase) {
            case 'Approach':
                return [
                    {
                        pillText: 'Discuss a new plan',
                        type: FollowUpTypes.NewPlan,
                        status: 'info',
                    },
                    {
                        pillText: 'Coming soon: Generate code',
                        type: FollowUpTypes.GenerateCode,
                        description: `Soon you'll be able to generate code based off of your plan`,
                        disabled: true,
                    },
                ]
            default:
                return []
        }
    }

    private async modifyDefaultSourceFolder(message: any) {
        const messenger = this.messengerFactory(message.tabID)

        const session = await this.sessionStorage.getSession(message.tabID)

        const uri = await createSingleFileDialog({
            defaultUri: vscode.Uri.file(session.config.workspaceRoot),
            canSelectFolders: true,
            canSelectFiles: false,
        }).prompt()

        if (uri instanceof vscode.Uri && !vscode.workspace.getWorkspaceFolder(uri)) {
            messenger.sendAnswer({
                message: new SelectedFolderNotInWorkspaceFolderError().message,
            })
            messenger.sendSystemPrompt({
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
            session.config.sourceRoot = uri.fsPath
            messenger.sendAnswer({
                message: `Changed source root to: ${session.config.sourceRoot}`,
            })
        }
    }

    private initialExamples(message: any) {
        const examples = `
You can use /dev to:
- Plan a code change
- Coming soon: Generate code suggestions

To learn more, visit the _[Amazon Q User Guide](${userGuideURL})_.
`
        const messenger = this.messengerFactory(message.tabID)

        messenger.sendAnswer({
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
        const messenger = this.messengerFactory(message.tabID)

        let session: Session | undefined
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            getLogger().debug(`${featureName}: Session created with id: ${session.tabID}`)

            const authState = await getChatAuthState()
            if (authState.amazonQ !== 'connected') {
                messenger.sendAuthNeededExceptionMessage(authState)
                session.isAuthenticating = true
                return
            }
        } catch (err: any) {
            messenger.sendErrorMessage(
                createUserFacingErrorMessage(err.message),
                this.retriesRemaining(session),
                session?.state.phase
            )
        }
    }

    private authClicked(message: any) {
        this.authController.handleAuth(message.authType)

        const messenger = this.messengerFactory(message.tabID)

        messenger.sendAnswer({
            message: 'Follow instructions to re-authenticate ...',
        })

        // Explicitly ensure the user goes through the re-authenticate flow
        messenger.sendChatInputEnabled(false)
    }

    private tabClosed(message: any) {
        this.sessionStorage.deleteSession(message.tabID)
    }

    private async newPlan(message: any) {
        // Emit the ending of the old session before creating a new one
        const session = await this.sessionStorage.getSession(message.tabID)
        telemetry.amazonq_endChat.emit({
            amazonqConversationId: session.conversationId,
            amazonqEndOfTheConversationLatency: performance.now() - session.telemetry.sessionStartTime,
            result: 'Succeeded',
        })

        // Old session for the tab is ending, delete it so we can create a new one for the message id
        this.sessionStorage.deleteSession(message.tabID)

        // Re-run the opening flow, where we check auth + create a session
        await this.tabOpened(message)

        const messenger = this.messengerFactory(message.tabID)

        messenger.sendAnswer({
            message: 'What change would you like to discuss?',
        })
        messenger.sendUpdatePlaceholder('Briefly describe a task or issue')
    }

    private sendFeedback() {
        submitFeedback.execute(placeholder, 'Amazon Q')
    }

    private processLink(message: any) {
        ExternalBrowserUtils.instance.openLink(message.link)
    }

    private insertCodeAtPosition(message: any) {
        this.contentController.insertTextAtCursorPosition(message.code, () => {})
    }

    private retriesRemaining(session: Session | undefined) {
        return session?.retries ?? defaultRetryLimit
    }
}
