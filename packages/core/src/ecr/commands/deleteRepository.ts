/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { EcrRepositoryNode } from '../explorer/ecrRepositoryNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function deleteRepository(node: EcrRepositoryNode): Promise<void> {
    getLogger().debug('DeleteRepository called for %O', node)

    const repositoryName = node.repository.repositoryName

    const isConfirmed = await showConfirmationDialog(repositoryName)
    if (!isConfirmed) {
        getLogger().info('DeleteRepository cancelled')
        telemetry.ecr_deleteRepository.emit({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Deleting repository ${repositoryName}`)
    try {
        await node.deleteRepository()

        getLogger().info(`deleted repository: ${repositoryName}`)

        void vscode.window.showInformationMessage(
            localize('AWS.ecr.deleteRepository.success', 'Deleted repository: {0}', repositoryName)
        )
        telemetry.ecr_deleteRepository.emit({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to delete repository ${repositoryName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.ecr.deleteRepository.failure', 'Failed to delete repository: {0}', repositoryName)
        )
        telemetry.ecr_deleteRepository.emit({ result: 'Failed' })
    } finally {
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node.parent)
    }
}

async function showConfirmationDialog(repositoryName: string): Promise<boolean> {
    const prompt = localize('AWS.s3.deleteBucket.prompt', 'Enter {0} to confirm deletion', repositoryName)
    const confirmationInput = await vscode.window.showInputBox({
        prompt,
        placeHolder: repositoryName,
        validateInput: input => (input !== repositoryName ? prompt : undefined),
    })

    return confirmationInput === repositoryName
}
