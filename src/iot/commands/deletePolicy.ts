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
import { IotPolicyFolderNode } from '../explorer/iotPolicyFolderNode'

/**
 * Deletes the policy represented by the given node.
 *
 * Checks if policy is not attached to any certificates.
 * Prompts the user for confirmation.
 * Deletes the policy.
 * Refreshes the parent node.
 */
export async function deletePolicyCommand(
    node: IotPolicyWithVersionsNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeletePolicy called for %O', node)

    const policyName = node.policy.name

    //FIXME check if policy can be deleted by getting attached certificates
    //with iot.listTargetsForPolicy()
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.iot.deletePolicy.prompt', 'Are you sure you want to delete Policy {0}?', policyName),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeletePolicy canceled')
        return
    }

    getLogger().info(`Deleting policy ${policyName}`)
    try {
        await node.iot.deletePolicy({ policyName: policyName })

        getLogger().info(`Successfully deleted Policy ${policyName}`)
        window.showInformationMessage(localize('AWS.iot.deletePolicy.success', 'Deleted Policy {0}', node.policy.name))
    } catch (e) {
        getLogger().error(`Failed to delete Policy ${policyName}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.deletePolicy.error', 'Failed to delete Policy {0}', node.policy.name),
            window
        )
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: IotPolicyFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
