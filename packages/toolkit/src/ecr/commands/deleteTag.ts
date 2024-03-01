/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EcrTagNode } from '../explorer/ecrTagNode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showConfirmationMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function deleteTag(node: EcrTagNode): Promise<void> {
    getLogger().debug('deleteTag called for %O', node)
    const ok = await showConfirmationMessage({
        prompt: localize(
            'AWS.ecr.deleteTag.prompt',
            'Are you sure you want to delete tag {0} from repository {1}',
            node.tag,
            node.repository.repositoryName
        ),
        confirm: localize('AWS.generic.delete', 'Delete'),
        cancel: localize('AWS.generic.cancel', 'Cancel'),
    })
    if (!ok) {
        getLogger().info(`Cancelled delete tag ${node.tag} from repository ${node.repository.repositoryName}`)
        telemetry.ecr_deleteTags.emit({ result: 'Cancelled', value: 1 })
        return
    }
    try {
        await node.deleteTag()

        getLogger().info(`Successfully deleted tag ${node.tag} from repository ${node.repository.repositoryName}`)

        void vscode.window.showInformationMessage(
            localize(
                'AWS.ecr.deleteTag.success',
                'Deleted tag {0} from repository {1}',
                node.tag,
                node.repository.repositoryName
            )
        )
        telemetry.ecr_deleteTags.emit({ result: 'Succeeded', value: 1 })
    } catch (e) {
        getLogger().error(`Failed to delete tag ${node.tag} from repository ${node.repository.repositoryName}: %s`, e)
        void showViewLogsMessage(
            localize(
                'AWS.ecr.deleteTag.failure',
                'Failed to delete tag {0} from repository {1}',
                node.tag,
                node.repository.repositoryName
            )
        )
        telemetry.ecr_deleteTags.emit({ result: 'Failed', value: 1 })
    } finally {
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node.parent)
    }
}
