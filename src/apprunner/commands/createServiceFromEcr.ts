/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EcrRepositoryNode } from '../../ecr/explorer/ecrRepositoryNode'
import { EcrTagNode } from '../../ecr/explorer/ecrTagNode'

import { CreateAppRunnerServiceWizard } from '../wizards/apprunnerCreateServiceWizard'
import { DefaultAppRunnerClient } from '../../shared/clients/apprunnerClient'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Result } from '../../shared/telemetry/telemetry'

export async function createFromEcr(
    node: EcrTagNode | EcrRepositoryNode,
    client = new DefaultAppRunnerClient(node.regionCode)
): Promise<void> {
    let telemetryResult: Result = 'Failed'

    try {
        const ecrNode = (node as any).tag === undefined ? (node as EcrRepositoryNode) : (node as EcrTagNode).parent
        const wizard = new CreateAppRunnerServiceWizard(node.regionCode, {
            SourceConfiguration: {
                ImageRepository: {
                    ImageIdentifier: `${ecrNode.repository.repositoryUri}:${(node as any).tag ?? 'latest'}`,
                    ImageRepositoryType: 'ECR',
                    ImageConfiguration: {},
                },
                AuthenticationConfiguration: {},
            },
        })
        const result = await wizard.run()

        if (result === undefined) {
            telemetryResult = 'Cancelled'
            return
        }

        await client.createService(result)
        await vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.apprunner_createService.emit({
            result: telemetryResult,
            appRunnerServiceSource: 'ecr',
            passive: false,
        })
    }

    return undefined
}
