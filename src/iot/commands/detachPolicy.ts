/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { IotCertWithPoliciesNode } from '../explorer/iotCertificateNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotPolicyCertNode } from '../explorer/iotPolicyNode'
import { IotPolicyFolderNode } from '../explorer/iotPolicyFolderNode'

/**
 * Detaches an IoT Policy from a certificate.
 *
 * Prompts the user for confirmation.
 * Detaches the policy.
 * Refreshes the parent node.
 */
export async function detachPolicyCommand(
    node: IotPolicyCertNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DetachPolicy called for %O', node)

    const policyName = node.policy.name
    if (node.parent instanceof IotPolicyFolderNode) {
        return undefined
    }
    const certId = node.parent.certificate.id
    const certArn = node.parent.certificate.arn

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.iot.detachPolicy.prompt', 'Are you sure you want to detach policy {0}?', policyName),
            confirm: localize('AWS.iot.detachCert.confirm', 'Detach'),
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DetachCert canceled')
        return
    }

    getLogger().info(`Detaching certificate ${certId}`)
    try {
        await node.iot.detachPolicy({ policyName: policyName, target: certArn })

        getLogger().info(`Successfully detached policy ${policyName}`)
        window.showInformationMessage(localize('AWS.iot.detachPolicy.success', 'Detached {0}', node.policy.name))
    } catch (e) {
        getLogger().error(`Failed to detach certificate ${certId}: %O`, e)
        showViewLogsMessage(localize('AWS.iot.detachPolicy.error', 'Failed to detach {0}', node.policy.name), window)
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: IotCertWithPoliciesNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
