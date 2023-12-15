/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sanitizeHtml from 'sanitize-html'
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { IllegalStateTransition, UserMessageNotFoundError } from '../errors'
import { SessionState, SessionStateAction, SessionStateConfig, SessionStateInteraction } from '../types'
import { prepareRepoData } from '../util/files'
import { uploadCode } from '../util/upload'

export class ConversationNotStartedState implements Omit<SessionState, 'uploadId'> {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Init'

    constructor(public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.approach = ''
    }

    async interact(_action: SessionStateAction): Promise<SessionStateInteraction> {
        throw new IllegalStateTransition()
    }
}

export class PrepareRefinementState implements Omit<SessionState, 'uploadId'> {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = 'Approach'
    constructor(private config: Omit<SessionStateConfig, 'uploadId'>, public approach: string, public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }
    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        const uploadId = await telemetry.amazonq_createUpload.run(async span => {
            span.record({ amazonqConversationId: this.config.conversationId })
            const { zipFileBuffer, zipFileChecksum } = await prepareRepoData(
                this.config.sourceRoot,
                action.telemetry,
                span
            )

            const { uploadUrl, uploadId, kmsKeyArn } = await this.config.proxyClient.createUploadUrl(
                this.config.conversationId,
                zipFileChecksum,
                zipFileBuffer.length
            )

            await uploadCode(uploadUrl, zipFileBuffer, zipFileChecksum, kmsKeyArn)
            return uploadId
        })

        const nextState = new RefinementState({ ...this.config, uploadId }, this.approach, this.tabID, 0)
        return nextState.interact(action)
    }
}

export class RefinementState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public readonly conversationId: string
    public readonly uploadId: string
    public readonly phase = 'Approach'

    constructor(
        private config: SessionStateConfig,
        public approach: string,
        public tabID: string,
        private currentIteration: number
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.conversationId = config.conversationId
        this.uploadId = config.uploadId
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        return telemetry.amazonq_approachInvoke.run(async span => {
            try {
                span.record({ amazonqConversationId: this.conversationId })
                action.telemetry.setGenerateApproachIteration(this.currentIteration)
                action.telemetry.setGenerateApproachLastInvocationTime()
                if (!action.msg) {
                    throw new UserMessageNotFoundError()
                }

                const approach = await this.config.proxyClient.generatePlan(
                    this.config.conversationId,
                    this.config.uploadId,
                    action.msg
                )

                this.approach = sanitizeHtml(
                    approach ??
                        'There has been a problem generating an approach. Please open a conversation in a new tab',
                    {}
                )
                getLogger().debug(`Approach response: %O`, this.approach)

                action.telemetry.recordUserApproachTelemetry(span, this.conversationId)
                return {
                    nextState: new RefinementState(
                        {
                            ...this.config,
                            conversationId: this.conversationId,
                        },
                        this.approach,
                        this.tabID,
                        this.currentIteration + 1
                    ),
                    interaction: {
                        content: `${this.approach}\n`,
                    },
                }
            } catch (e) {
                throw e instanceof ToolkitError
                    ? e
                    : ToolkitError.chain(e, 'Server side error', { code: 'UnhandledApproachServerSideError' })
            }
        })
    }
}
