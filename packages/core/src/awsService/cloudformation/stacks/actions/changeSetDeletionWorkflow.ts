/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid'
import { StackActionPhase, StackActionState } from './stackActionRequestType'
import { LanguageClient } from 'vscode-languageclient/node'
import {
    showErrorMessage,
    showChangeSetDeletionStarted,
    showChangeSetDeletionSuccess,
    showChangeSetDeletionFailure,
} from '../../ui/message'
import { deleteChangeSet, describeChangeSetDeletionStatus, getChangeSetDeletionStatus } from './stackActionApi'
import { createChangeSetDeletionParams } from './stackActionUtil'
import { getLogger } from '../../../../shared/logger/logger'
import { commandKey, extractErrorMessage } from '../../utils'
import { commands } from 'vscode'
import globals from '../../../../shared/extensionGlobals'

export class ChangeSetDeletion {
    private readonly id: string
    private status: StackActionPhase | undefined

    constructor(
        private readonly stackName: string,
        private readonly changeSetName: string,
        private readonly client: LanguageClient
    ) {
        this.id = uuidv4()
    }

    async delete() {
        await deleteChangeSet(this.client, createChangeSetDeletionParams(this.id, this.stackName, this.changeSetName))
        showChangeSetDeletionStarted(this.changeSetName, this.stackName)
        this.pollForProgress()
    }

    private pollForProgress() {
        const interval = globals.clock.setInterval(() => {
            getChangeSetDeletionStatus(this.client, { id: this.id })
                .then(async (deletionResult) => {
                    if (deletionResult.phase === this.status) {
                        return
                    }

                    this.status = deletionResult.phase

                    switch (deletionResult.phase) {
                        case StackActionPhase.DELETION_IN_PROGRESS:
                            break
                        case StackActionPhase.DELETION_COMPLETE:
                            if (deletionResult.state === StackActionState.SUCCESSFUL) {
                                showChangeSetDeletionSuccess(this.changeSetName, this.stackName)
                            } else {
                                const describeDeplomentStatusResult = await describeChangeSetDeletionStatus(
                                    this.client,
                                    {
                                        id: this.id,
                                    }
                                )
                                showChangeSetDeletionFailure(
                                    this.changeSetName,
                                    this.stackName,
                                    describeDeplomentStatusResult.FailureReason ?? 'No failure reason provided'
                                )
                            }
                            void commands.executeCommand(commandKey('stacks.refresh'))
                            globals.clock.clearInterval(interval)
                            break
                        case StackActionPhase.DELETION_FAILED: {
                            const describeDeplomentStatusResult = await describeChangeSetDeletionStatus(this.client, {
                                id: this.id,
                            })
                            showChangeSetDeletionFailure(
                                this.changeSetName,
                                this.stackName,
                                describeDeplomentStatusResult.FailureReason ?? 'No failure reason provided'
                            )
                            void commands.executeCommand(commandKey('stacks.refresh'))
                            globals.clock.clearInterval(interval)
                            break
                        }
                    }
                })
                .catch(async (error) => {
                    getLogger().error(`Error polling for deletion status: ${error}`)
                    showErrorMessage(`Error polling for deletion status: ${extractErrorMessage(error)}`)
                    void commands.executeCommand(commandKey('stacks.refresh'))
                    globals.clock.clearInterval(interval)
                })
        }, 1000)
    }
}
