/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid'
import { StackActionPhase, StackActionState } from './stackActionRequestType'
import { LanguageClient } from 'vscode-languageclient/node'
import { showDeploymentStarted, showDeploymentSuccess, showDeploymentFailure, showErrorMessage } from '../../ui/message'
import { createDeploymentStatusBar, updateWorkflowStatus } from '../../ui/statusBar'
import { StatusBarItem } from 'vscode'
import { deploy, describeDeploymentStatus, getDeploymentStatus } from './stackActionApi'
import { createDeploymentParams } from './stackActionUtil'
import { getLogger } from '../../../../shared/logger/logger'
import { extractErrorMessage } from '../../utils'

export class Deployment {
    private readonly id: string
    private readonly stackName: string
    private readonly changeSetName: string
    private readonly client: LanguageClient
    private status: StackActionPhase | undefined
    private statusBarItem?: StatusBarItem

    constructor(stackName: string, changeSetName: string, client: LanguageClient) {
        this.id = uuidv4()
        this.stackName = stackName
        this.changeSetName = changeSetName
        this.client = client
    }

    async deploy() {
        await deploy(this.client, createDeploymentParams(this.id, this.stackName, this.changeSetName))
        showDeploymentStarted(this.stackName)
        this.statusBarItem = createDeploymentStatusBar()
        this.pollForProgress()
    }

    private pollForProgress() {
        const interval = setInterval(() => {
            getDeploymentStatus(this.client, { id: this.id })
                .then(async (deploymentResult) => {
                    if (deploymentResult.phase === this.status) {
                        return
                    }

                    this.status = deploymentResult.phase
                    if (this.statusBarItem) {
                        updateWorkflowStatus(this.statusBarItem, deploymentResult.phase)
                    }

                    switch (deploymentResult.phase) {
                        case StackActionPhase.DEPLOYMENT_IN_PROGRESS:
                            break
                        case StackActionPhase.DEPLOYMENT_COMPLETE:
                            if (deploymentResult.state === StackActionState.SUCCESSFUL) {
                                showDeploymentSuccess(this.stackName)
                            } else {
                                const describeDeplomentStatusResult = await describeDeploymentStatus(this.client, {
                                    id: this.id,
                                })
                                showDeploymentFailure(
                                    this.stackName,
                                    describeDeplomentStatusResult.FailureReason ?? 'UNKNOWN'
                                )
                            }
                            clearInterval(interval)
                            break
                        case StackActionPhase.DEPLOYMENT_FAILED:
                        case StackActionPhase.VALIDATION_FAILED: {
                            const describeDeplomentStatusResult = await describeDeploymentStatus(this.client, {
                                id: this.id,
                            })
                            showDeploymentFailure(
                                this.stackName,
                                describeDeplomentStatusResult.FailureReason ?? 'UNKNOWN'
                            )
                            clearInterval(interval)
                            break
                        }
                    }
                })
                .catch(async (error) => {
                    getLogger().error(`Error polling for deployment status: ${error}`)
                    showErrorMessage(`Error polling for deployment status: ${extractErrorMessage(error)}`)
                    clearInterval(interval)
                })
        }, 1000)
    }
}
