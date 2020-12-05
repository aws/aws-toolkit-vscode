/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { EcrNode } from '../explorer/ecrNode'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showErrorWithLogs } from '../../shared/utilities/messages'
import { validateRepositoryName } from '../utils'
import { recordEcrCreateRepository } from '../../shared/telemetry/telemetry'

export async function createRepository(
    node: EcrNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('createRepository called for %O', node)

    const repositoryName = await window.showInputBox({
        prompt: localize('AWS.ecr.createRepository.prompt', 'Enter a new repository name'),
        placeHolder: localize('AWS.ecr.createRepository.placeHolder', 'Repository Name'),
        validateInput: validateRepositoryName,
    })

    if (!repositoryName) {
        getLogger().info('createRepository cancelled')
        recordEcrCreateRepository({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Creating repository ${repositoryName}`)
    try {
        const repository = await node.createRepository(repositoryName)

        getLogger().info('Successfully created repository %O', repository)
        window.showInformationMessage(
            localize('AWS.ecr.createRepository.success', 'Created repository {0}', repositoryName)
        )
        recordEcrCreateRepository({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to create repository ${repositoryName}: %O`, e)
        showErrorWithLogs(
            localize('AWS.ecr.createRepository.failure', 'Failed to create repository {0}', repositoryName),
            window
        )
        recordEcrCreateRepository({ result: 'Failed' })
    } finally {
        await commands.execute('aws.refreshAwsExplorerNode', node)
    }
}
