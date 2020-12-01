/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { recordEcrDeleteTags } from '../../shared/telemetry/telemetry'
import { EcrTagNode } from '../explorer/ecrTagNode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showConfirmationMessage, showErrorWithLogs } from '../../shared/utilities/messages'

export async function deleteTag(
    node: EcrTagNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('deleteTag called for %O', node)
    const ok = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.ecr.deleteTag.prompt',
                'Are you sure you want to delete tag {0} from repository {1}',
                node.tag,
                node.repository.repositoryName
            ),
            confirm: localize('AWS.generic.delete', 'Delete'),
            cancel: localize('AWS.generic.cancel', 'Cancel'),
        },
        window
    )
    if (!ok) {
        getLogger().info(`Cancelled delete tag ${node.tag} from repository ${node.repository.repositoryName}`)
        // We only have single select in vsc so we alway say that 1 tag was deleted (or not)
        recordEcrDeleteTags({ result: 'Cancelled', value: 1 })
        return
    }
    try {
        await node.deleteTag()

        getLogger().info(`Successfully deleted tag ${node.tag} from repository ${node.repository.repositoryName}`)

        window.showInformationMessage(
            localize(
                'AWS.ecr.deleteTag.success',
                'Deleted tag {0} from repository {1}',
                node.tag,
                node.repository.repositoryName
            )
        )
        recordEcrDeleteTags({ result: 'Succeeded', value: 1 })
    } catch (e) {
        getLogger().error(`Failed to delete tag ${node.tag} from repository ${node.repository.repositoryName}: %O`, e)
        showErrorWithLogs(
            localize(
                'AWS.ecr.deleteTag.failure',
                'Failed to delete tag {0} from repository {1}',
                node.tag,
                node.repository.repositoryName
            ),
            window
        )
        recordEcrDeleteTags({ result: 'Failed', value: 1 })
    } finally {
        await commands.execute('aws.refreshAwsExplorerNode', node.parent)
    }
}
