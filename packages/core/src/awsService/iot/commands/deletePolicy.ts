/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../../shared/localizedText'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { IotPolicyWithVersionsNode } from '../explorer/iotPolicyNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../../shared/utilities/messages'

/**
 * Deletes the policy represented by the given node.
 *
 * Checks if policy is not attached to any certificates.
 * Prompts the user for confirmation.
 * Deletes the policy.
 * Refreshes the parent node.
 */
export async function deletePolicyCommand(node: IotPolicyWithVersionsNode): Promise<void> {
    getLogger().debug('DeletePolicy called for %O', node)

    const policyName = node.policy.name

    const isConfirmed = await showConfirmationMessage({
        prompt: localize('AWS.iot.deletePolicy.prompt', 'Are you sure you want to delete Policy {0}?', policyName),
        confirm: localizedText.localizedDelete,
        cancel: localizedText.cancel,
    })
    if (!isConfirmed) {
        getLogger().info('DeletePolicy canceled')
        return
    }

    getLogger().info(`Deleting policy ${policyName}`)
    try {
        const certs = await node.iot.listPolicyTargets({ policyName })
        if (certs.length > 0) {
            getLogger().error(`Policy ${policyName} has attached Certificates`)
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.iot.deletePolicy.attachedError',
                    'Cannot delete {0}. Policy has attached certificates: {1}',
                    policyName,
                    certs.join(', ')
                )
            )
            return
        }
        const versions = node.iot.listPolicyVersions({ policyName })
        let numVersions: number = 0
        for await (const _version of versions) {
            numVersions++
        }
        if (numVersions !== 1) {
            getLogger().error(`Policy ${policyName} has non-default versions`)
            void vscode.window.showErrorMessage(
                localize('AWS.iot.deletePolicy.versionError', 'Policy {0} has non-default versions', policyName)
            )
            return
        }
        await node.iot.deletePolicy({ policyName })

        getLogger().info(`deleted Policy: ${policyName}`)
        void vscode.window.showInformationMessage(
            localize('AWS.iot.deletePolicy.success', 'Deleted Policy: {0}', node.policy.name)
        )
    } catch (e) {
        getLogger().error(`Failed to delete Policy: ${policyName}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.iot.deletePolicy.error', 'Failed to delete Policy: {0}', node.policy.name)
        )
    }

    // Refresh the Policy Folder node
    await node.parent.refreshNode()
}
