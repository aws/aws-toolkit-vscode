/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EcrRepositoryNode } from '../../ecr/explorer/ecrRepositoryNode'
import { EcrTagNode } from '../../ecr/explorer/ecrTagNode'

import { CreateAppRunnerServiceWizard } from '../wizards/apprunnerCreateServiceWizard'
import globals from '../../shared/extensionGlobals'
import { getTelemetryLogger } from '../../shared/telemetry/recorder'

export async function createFromEcr(node: EcrTagNode | EcrRepositoryNode): Promise<void> {
    getTelemetryLogger('ApprunnerCreateService').recordAppRunnerServiceSource('ecr')

    const ecrNode = (node as any).tag === undefined ? (node as EcrRepositoryNode) : (node as EcrTagNode).parent
    const client = globals.toolkitClientBuilder.createAppRunnerClient(ecrNode.regionCode)
    const wizard = new CreateAppRunnerServiceWizard(ecrNode.regionCode, {
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
        getTelemetryLogger('ApprunnerCreateService').recordResult('Cancelled')
        return
    }

    await client.createService(result)
    vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
}
