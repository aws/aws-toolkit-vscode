/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { EcrRepositoryNode } from '../explorer/ecrRepositoryNode'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showErrorWithLogs } from '../../shared/utilities/messages'
import { recordEcrDeleteRepository } from '../../shared/telemetry/telemetry'

export async function deleteRepository(
    node: EcrRepositoryNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeleteRepository called for %O', node)

    const repositoryName = node.repository.repositoryName

    const isConfirmed = await showConfirmationDialog(repositoryName, window)
    if (!isConfirmed) {
        getLogger().info('DeleteRepository cancelled')
        recordEcrDeleteRepository({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Deleting repository ${repositoryName}`)
    try {
        await node.deleteRepository()

        getLogger().info(`Successfully deleted repository ${repositoryName}`)

        window.showInformationMessage(
            localize('AWS.ecr.deleteRepository.success', 'Deleted repository {0}', repositoryName)
        )
        recordEcrDeleteRepository({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to delete repository ${repositoryName}: %O`, e)
        showErrorWithLogs(
            localize('AWS.ecr.deleteRepository.failure', 'Failed to delete repository {0}', repositoryName),
            window
        )
        recordEcrDeleteRepository({ result: 'Failed' })
    } finally {
        await commands.execute('aws.refreshAwsExplorerNode', node.parent)
    }
}

async function showConfirmationDialog(repositoryName: string, window: Window): Promise<boolean> {
    const prompt = localize('AWS.s3.deleteBucket.prompt', 'Enter {0} to confirm deletion', repositoryName)
    const confirmationInput = await window.showInputBox({
        prompt,
        placeHolder: repositoryName,
        validateInput: input => (input !== repositoryName ? prompt : undefined),
    })

    return confirmationInput === repositoryName
}
