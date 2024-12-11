/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../../shared/localizedText'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage, showConfirmationMessage } from '../../../shared/utilities/messages'
import { IotPolicyVersionNode } from '../explorer/iotPolicyVersionNode'

/**
 * Deletes the policy version represented by the given node.
 *
 * Prompts the user for confirmation.
 * Deletes the policy version.
 * Refreshes the parent node.
 */
export async function deletePolicyVersionCommand(node: IotPolicyVersionNode): Promise<void> {
    getLogger().debug('DeletePolicyVersion called for %O', node)

    const policyName = node.policy.name
    const policyVersionId = node.version.versionId!

    const isConfirmed = await showConfirmationMessage({
        prompt: localize(
            'AWS.iot.deletePolicyVersion.prompt',
            'Are you sure you want to delete Version {0} of Policy {1}?',
            policyVersionId,
            policyName
        ),
        confirm: localizedText.localizedDelete,
        cancel: localizedText.cancel,
    })
    if (!isConfirmed) {
        getLogger().info('DeletePolicyVersion canceled')
        return
    }

    getLogger().info(`Deleting version ${policyVersionId} of policy ${policyName}`)
    try {
        await node.iot.deletePolicyVersion({ policyName, policyVersionId })

        getLogger().info(`deleted Policy Version: ${policyVersionId}`)
        void vscode.window.showInformationMessage(
            localize(
                'AWS.iot.deletePolicyVersion.success',
                'Deleted Version {0} of Policy {1}',
                policyVersionId,
                policyName
            )
        )
    } catch (e) {
        getLogger().error(`Failed to delete Policy Version: ${policyVersionId}: %s`, e)
        void showViewLogsMessage(
            localize(
                'AWS.iot.deletePolicyVersion.error',
                'Failed to delete Version {0} of Policy {1}',
                policyVersionId,
                policyName
            )
        )
    }

    // Refresh the policy node
    await node.parent.refreshNode()
}
