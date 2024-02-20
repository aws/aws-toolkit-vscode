/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { EcrNode } from '../explorer/ecrNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { validateRepositoryName } from '../utils'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function createRepository(node: EcrNode): Promise<void> {
    getLogger().debug('createRepository called for %O', node)

    const repositoryName = await vscode.window.showInputBox({
        prompt: localize('AWS.ecr.createRepository.prompt', 'Enter a new repository name'),
        placeHolder: localize('AWS.ecr.createRepository.placeHolder', 'Repository Name'),
        validateInput: validateRepositoryName,
    })

    if (!repositoryName) {
        getLogger().info('createRepository cancelled')
        telemetry.ecr_createRepository.emit({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Creating repository ${repositoryName}`)
    try {
        const repository = await node.createRepository(repositoryName)

        getLogger().info('created repository: %O', repository)
        void vscode.window.showInformationMessage(
            localize('AWS.ecr.createRepository.success', 'Created repository: {0}', repositoryName)
        )
        telemetry.ecr_createRepository.emit({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to create repository ${repositoryName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.ecr.createRepository.failure', 'Failed to create repository: {0}', repositoryName)
        )
        telemetry.ecr_createRepository.emit({ result: 'Failed' })
    } finally {
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
    }
}
