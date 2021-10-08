/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { IotPolicyWithVersionsNode } from '../explorer/iotPolicyNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotPolicyVersionNode } from '../explorer/iotPolicyVersionNode'

/**
 * Deletes the policy version represented by the given node.
 *
 * Prompts the user for confirmation.
 * Deletes the policy version.
 * Refreshes the parent node.
 */
export async function deletePolicyVersionCommand(
    node: IotPolicyVersionNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeletePolicy called for %O', node)

    if (node.isDefault) {
        window.showInformationMessage(
            localize('AWS.iot.deletePolicyVersion.error', 'Cannot delete default version of a policy')
        )
        return undefined
    }
    const policyName = node.policy.name
    const versionId = node.version.versionId ?? ''

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.iot.deletePolicyVersion.prompt',
                'Are you sure you want to delete Version {0} of Policy {1}?',
                versionId,
                policyName
            ),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeletePolicyVersion canceled')
        return
    }

    getLogger().info(`Deleting version ${versionId} of policy ${policyName}`)
    try {
        await node.iot.deletePolicyVersion({ policyName: policyName, policyVersionId: versionId })

        getLogger().info(`Successfully deleted Policy Version ${versionId}`)
        window.showInformationMessage(
            localize('AWS.iot.deletePolicyVersion.success', 'Deleted Version {0} of Policy {1}', versionId, policyName)
        )
    } catch (e) {
        getLogger().error(`Failed to delete Policy Version ${versionId}: %O`, e)
        showViewLogsMessage(
            localize(
                'AWS.iot.deletePolicyVersion.error',
                'Failed to delete Version {0} of Policy {1}',
                versionId,
                policyName
            ),
            window
        )
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: IotPolicyWithVersionsNode, commands: Commands): Promise<void> {
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
