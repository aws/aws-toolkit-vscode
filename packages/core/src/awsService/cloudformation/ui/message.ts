/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { getDeploymentStatus } from '../stacks/actions/stackActionApi'
import { StackActionPhase, StackActionState } from '../stacks/actions/stackActionRequestType'

export async function showDeploymentCompletion(
    client: LanguageClient,
    deploymentId: string,
    stackName: string
): Promise<void> {
    try {
        const pollResult = await getDeploymentStatus(client, { id: deploymentId })

        if (
            pollResult.phase === StackActionPhase.DEPLOYMENT_COMPLETE &&
            pollResult.state === StackActionState.SUCCESSFUL
        ) {
            void window.showInformationMessage(`Deployment completed successfully for stack: ${stackName}`)
        } else if (
            pollResult.phase === StackActionPhase.DEPLOYMENT_FAILED ||
            pollResult.phase === StackActionPhase.VALIDATION_FAILED ||
            pollResult.state === StackActionState.FAILED
        ) {
            void window.showErrorMessage(`Deployment failed for stack: ${stackName}`)
        } else {
            void window.showWarningMessage(`Deployment status unknown for stack: ${stackName}`)
        }
    } catch (error) {
        void window.showErrorMessage(`Error checking deployment status for stack: ${stackName}`)
    }
}

export function showDeploymentSuccess(stackName: string) {
    void window.showInformationMessage(`Deployment completed successfully for stack: ${stackName}`)
}

export function showChangeSetDeletionSuccess(changeSetName: string, stackName: string) {
    void window.showInformationMessage(
        `Deletion completed successfully for change set: ${changeSetName}, in stack: ${stackName}`
    )
}

export function showDeploymentFailure(stackName: string, failureReason: string) {
    void window.showErrorMessage(`Deployment failed for stack: ${stackName} with reason: ${failureReason}`)
}

export function showChangeSetDeletionFailure(changeSetName: string, stackName: string, failureReason: string) {
    void window.showErrorMessage(
        `Change Set Deletion failed for change set: ${changeSetName}, in stack: ${stackName} with reason: ${failureReason}`
    )
}

export function showValidationComplete(stackName: string) {
    void window.showInformationMessage(`Validation completed for stack: ${stackName}. Starting deployment...`)
}

export function showValidationStarted(stackName: string) {
    void window.showInformationMessage(`Validation started for stack: ${stackName}`)
}

export function showValidationSuccess(stackName: string) {
    void window.showInformationMessage(`Validation completed successfully for stack: ${stackName}`)
}

export function showValidationFailure(stackName: string, failureReason: string) {
    void window.showErrorMessage(`Validation failed for stack: ${stackName} with reason: ${failureReason}`)
}

export function showDeploymentStarted(stackName: string) {
    void window.showInformationMessage(`Deployment started for stack: ${stackName}`)
}

export function showChangeSetDeletionStarted(changeSetName: string, stackName: string) {
    void window.showInformationMessage(`Deletion started for change set: ${changeSetName}, in stack: ${stackName}`)
}

export function showErrorMessage(message: string) {
    void window.showErrorMessage(message)
}
