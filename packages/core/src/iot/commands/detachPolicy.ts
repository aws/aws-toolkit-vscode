/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotPolicyCertNode } from '../explorer/iotPolicyNode'
import { IotPolicyFolderNode } from '../explorer/iotPolicyFolderNode'
import { IotCertificateNode, IotCertWithPoliciesNode, IotThingCertNode } from '../explorer/iotCertificateNode'
import { IotNode } from '../explorer/iotNodes'

/**
 * Detaches an IoT Policy from a certificate.
 *
 * Prompts the user for confirmation.
 * Detaches the policy.
 * Refreshes the parent node.
 */
export async function detachPolicyCommand(node: IotPolicyCertNode): Promise<void> {
    getLogger().debug('DetachPolicy called for %O', node)

    const policyName = node.policy.name
    if (node.parent instanceof IotPolicyFolderNode) {
        return undefined
    }
    const certId = node.parent.certificate.id
    const certArn = node.parent.certificate.arn

    const isConfirmed = await showConfirmationMessage({
        prompt: localize('AWS.iot.detachPolicy.prompt', 'Are you sure you want to detach policy {0}?', policyName),
        confirm: localize('AWS.iot.detachCert.confirm', 'Detach'),
        cancel: localizedText.cancel,
    })
    if (!isConfirmed) {
        getLogger().info('DetachCert canceled')
        return
    }

    getLogger().info(`Detaching certificate: ${certId}`)
    try {
        await node.iot.detachPolicy({ policyName, target: certArn })

        getLogger().info(`detached policy: ${policyName}`)
        void vscode.window.showInformationMessage(localize('AWS.iot.detachPolicy.success', 'Detached: {0}', policyName))
    } catch (e) {
        getLogger().error(`Failed to detach certificate: ${certId}: %s`, e)
        void showViewLogsMessage(localize('AWS.iot.detachPolicy.error', 'Failed to detach: {0}', policyName))
    }

    /* Refresh both things and certificates nodes so the status is updated in
     * both trees. */
    const baseNode = getBaseNode(node.parent)
    await baseNode?.thingFolderNode?.refreshNode()
    await baseNode?.certFolderNode?.refreshNode()
}

/**
 * Gets the node at the root of the IoT tree. This is so nodes in multiple
 * subtrees can be refreshed when an action affects more than one node.
 */
function getBaseNode(node: IotCertificateNode): IotNode | undefined {
    if (node instanceof IotThingCertNode) {
        return node.parent.parent.parent
    }
    if (node instanceof IotCertWithPoliciesNode) {
        return node.parent.parent
    }
    return undefined
}
