/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'vscode'
import { Messenger } from './messenger/messenger'
import { ChatSessionStorage } from '../../storages/chatSession'
import { FollowUpTypes, SessionStatePhase } from '../../types'
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'
import { weaverbirdScheme } from '../../constants'
import { defaultRetryLimit } from '../../limits'
import { Session } from '../../session/session'
import { telemetry } from '../../../shared/telemetry/telemetry'

export interface ChatControllerEventEmitters {
    readonly processHumanChatMessage: EventEmitter<any>
    readonly followUpClicked: EventEmitter<any>
    readonly openDiff: EventEmitter<any>
    readonly stopResponse: EventEmitter<any>
    readonly tabOpened: EventEmitter<any>
    readonly tabClosed: EventEmitter<any>
}

export class WeaverbirdController {
    private readonly messenger: Messenger
    private readonly sessionStorage: ChatSessionStorage

    // Any events that have to be finished before we can actually serve requests e.g. code uploading
    private preloader: () => Promise<void>
    private preloaderFinished: boolean = false

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerEventEmitters,
        messenger: Messenger,
        sessionStorage: ChatSessionStorage
    ) {
        this.messenger = messenger
        this.sessionStorage = sessionStorage

        // preloader is defined when a tab is opened
        this.preloader = async () => {}

        this.chatControllerMessageListeners.processHumanChatMessage.event(data => {
            this.processUserChatMessage(data)
        })
        this.chatControllerMessageListeners.followUpClicked.event(data => {
            switch (data.followUp.type) {
                case FollowUpTypes.WriteCode:
                    this.writeCodeClicked(data)
                    break
                case FollowUpTypes.AcceptCode:
                    this.acceptCode(data)
                    break
                case FollowUpTypes.RejectCode:
                    // TODO figure out what we want to do here
                    break
                case FollowUpTypes.Retry:
                    this.retryRequest(data)
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
    }

    // TODO add type
    private async processUserChatMessage(message: any) {
        if (message.message == undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID, 0)
            return
        }

        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)

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
            const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
            this.messenger.sendErrorMessage(errorMessage, message.tabID, this.retriesRemaining(session))
        }
    }

    /**
     * Handle a regular incoming message when a user is in the approach phase
     */
    private async onApproachGeneration(session: Session, message: string, tabID: string) {
        await this.preloader()

        const interactions = await session.send(message)

        // Resolve the "..." with the content
        this.messenger.sendAnswer({
            message: interactions.content,
            type: 'answer-part',
            tabID: tabID,
        })

        // Follow up with action items and complete the request stream
        this.messenger.sendAnswer({
            type: 'answer',
            followUps: this.getFollowUpOptions(session.state.phase),
            tabID: tabID,
        })
    }

    /**
     * Handle a regular incoming message when a user is in the code generation phase
     */
    private async onCodeGeneration(session: Session, message: string, tabID: string) {
        // lock the UI/show loading bubbles
        telemetry.awsq_codeGenerateClick.emit({ value: 1 })

        this.messenger.sendAsyncFollowUp(tabID, true, 'Code generation started')

        try {
            await session.send(message)
            const filePaths = session.state.filePaths
            if (!filePaths || filePaths.length === 0) {
                this.messenger.sendAnswer({
                    message: 'Unable to generate any file changes',
                    type: 'answer',
                    tabID: tabID,
                    followUps:
                        this.retriesRemaining(session) > 0
                            ? [
                                  {
                                      pillText: 'Retry',
                                      type: FollowUpTypes.Retry,
                                  },
                              ]
                            : [],
                })
                return
            }

            // Only add the follow up accept/deny buttons when the tab hasn't been closed/request hasn't been cancelled
            if (session?.state.tokenSource.token.isCancellationRequested) {
                return
            }

            this.messenger.sendAnswer({
                message: 'Changes to files done. Please review:',
                type: 'answer-part',
                tabID: tabID,
            })
            this.messenger.sendFilePaths(filePaths, tabID, session?.state.conversationId ?? '')
            this.messenger.sendAnswer({
                message: undefined,
                type: 'answer',
                followUps: this.getFollowUpOptions(session?.state.phase),
                tabID: tabID,
            })
        } finally {
            // Unlock the UI
            this.messenger.sendAsyncFollowUp(tabID, false, undefined)
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
            const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
            this.messenger.sendErrorMessage(errorMessage, message.tabID, this.retriesRemaining(session))
        }
    }

    // TODO add type
    private async acceptCode(message: any) {
        let session
        try {
            session = await this.sessionStorage.getSession(message.tabID)
            telemetry.awsq_isAcceptedCodeChanges.emit({ enabled: true })
            await session.acceptChanges()
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                `Failed to accept code changes: ${err.message}`,
                message.tabID,
                this.retriesRemaining(session)
            )
        }
    }

    private async retryRequest(message: any) {
        let session
        try {
            this.messenger.sendAsyncFollowUp(message.tabID, true, undefined)

            session = await this.sessionStorage.getSession(message.tabID)

            // Decrease retries before making this request, just in case this one fails as well
            session.decreaseRetries()

            // Sending an empty message will re-run the last state with the previous values
            await this.processUserChatMessage({
                message: '',
                tabID: message.tabID,
            })
        } catch (err: any) {
            this.messenger.sendErrorMessage(
                `Failed to retry request: ${err.message}`,
                message.tabID,
                this.retriesRemaining(session)
            )
        } finally {
            this.messenger.sendAsyncFollowUp(message.tabID, false, undefined)
        }
    }

    private getFollowUpOptions(phase: SessionStatePhase | undefined): ChatItemFollowUp[] {
        switch (phase) {
            case 'Approach':
                return [
                    {
                        pillText: 'Write Code',
                        type: FollowUpTypes.WriteCode,
                    },
                ]
            case 'Codegen':
                return [
                    {
                        pillText: 'Accept changes',
                        type: FollowUpTypes.AcceptCode,
                    },
                    {
                        pillText: 'Reject and discuss',
                        type: FollowUpTypes.RejectCode,
                    },
                ]
            default:
                return []
        }
    }

    private async openDiff(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        const workspaceRoot = session.config.workspaceRoot ?? ''
        const originalPath = path.join(workspaceRoot, message.rightPath)
        let left
        if (existsSync(originalPath)) {
            left = vscode.Uri.file(originalPath)
        } else {
            left = vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty', query: `tabID=${message.tabID}` })
        }

        vscode.commands.executeCommand(
            'vscode.diff',
            left,
            vscode.Uri.from({
                scheme: weaverbirdScheme,
                path: message.rightPath,
                query: `tabID=${message.tabID}`,
            })
        )
    }

    private async stopResponse(message: any) {
        const session = await this.sessionStorage.getSession(message.tabID)
        session.state.tokenSource.cancel()
    }

    private async tabOpened(message: any) {
        let session: Session | undefined
        try {
            session = await this.sessionStorage.createSession(message.tabID)
            this.preloader = async () => {
                if (!this.preloaderFinished && session) {
                    await session.setupConversation()
                    this.preloaderFinished = true
                }
            }
        } catch (err: any) {
            this.messenger.sendErrorMessage(err.message, message.tabID, this.retriesRemaining(session))
        }
    }

    private tabClosed(message: any) {
        this.sessionStorage.deleteSession(message.tabID)
    }

    private retriesRemaining(session: Session | undefined) {
        return session?.retries ?? defaultRetryLimit
    }
}
