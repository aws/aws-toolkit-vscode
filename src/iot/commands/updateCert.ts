/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { IotCertificateNode } from '../explorer/iotCertificateNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotThingNode } from '../explorer/iotThingNode'
import { IotCertsFolderNode } from '../explorer/iotCertFolderNode'
import { IotNode } from '../explorer/iotNodes'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'

const STATUS_REVOKED = 'REVOKED'
const STATUS_ACTIVE = 'ACTIVE'
const STATUS_INACTIVE = 'INACTIVE'

/**
 * Deactivates an active certificate.
 *
 * Prompts the user for confirmation.
 * Deactivates the certificate.
 * Refreshes the parent node.
 */
export async function deactivateCertificateCommand(
    node: IotCertificateNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeactivateCert called for %O', node)

    const certId = node.certificate.id

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.iot.deactivateCert.prompt',
                'Are you sure you want to deactivate certificate {0}?',
                certId
            ),
            confirm: localize('AWS.iot.deactivateCert.confirm', 'Deactivate'),
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeactivateCert canceled')
        return
    }

    getLogger().info(`Deactivating certificate ${certId}`)
    try {
        await node.iot.updateCertificate({ certificateId: certId, newStatus: STATUS_INACTIVE })

        getLogger().info(`Successfully deactivated certificate ${certId}`)
        window.showInformationMessage(
            localize('AWS.iot.deactivateCert.success', 'Deactivated {0}', node.certificate.id)
        )
    } catch (e) {
        getLogger().error(`Failed to deactivate certificate ${certId}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.deactivateCert.error', 'Failed to deactivate {0}', node.certificate.id),
            window
        )
    }

    /* Refresh both things and certificates nodes so the status is updated in
     * both trees. */
    const baseNode = getBaseNode(node.parent)
    await refreshNode(baseNode.thingFolderNode, commands)
    await refreshNode(baseNode.certFolderNode, commands)
}

/**
 * Activates an inactive certificate.
 *
 * Prompts the user for confirmation.
 * Activates the certificate.
 * Refreshes the parent node.
 */
export async function activateCertificateCommand(
    node: IotCertificateNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('ActivateCert called for %O', node)

    const certId = node.certificate.id

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.iot.activateCert.prompt',
                'Are you sure you want to activate certificate {0}?',
                certId
            ),
            confirm: localize('AWS.iot.activateCert.confirm', 'Activate'),
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('ActivateCert canceled')
        return
    }

    getLogger().info(`Activating certificate ${certId}`)
    try {
        await node.iot.updateCertificate({ certificateId: certId, newStatus: STATUS_ACTIVE })

        getLogger().info(`Successfully activated certificate ${certId}`)
        window.showInformationMessage(localize('AWS.iot.activateCert.success', 'Activated {0}', node.certificate.id))
    } catch (e) {
        getLogger().error(`Failed to activate certificate ${certId}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.activateCert.error', 'Failed to activate {0}', node.certificate.id),
            window
        )
    }

    /* Refresh both things and certificates nodes so the status is updated in
     * both trees. */
    const baseNode = getBaseNode(node.parent)
    await refreshNode(baseNode.thingFolderNode, commands)
    await refreshNode(baseNode.certFolderNode, commands)
}

/**
 * Revokes an active certificate.
 *
 * Prompts the user for confirmation.
 * Revokes the certificate.
 * Refreshes the parent node.
 */
export async function revokeCertificateCommand(
    node: IotCertificateNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('RevokeCert called for %O', node)

    const certId = node.certificate.id

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.iot.revokeCert.prompt', 'Are you sure you want to revoke certificate {0}?', certId),
            confirm: localize('AWS.iot.revokeCert.confirm', 'Revoke'),
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('RevokeCert canceled')
        return
    }

    getLogger().info(`Revoking certificate ${certId}`)
    try {
        await node.iot.updateCertificate({ certificateId: certId, newStatus: STATUS_REVOKED })

        getLogger().info(`Successfully revoked certificate ${certId}`)
        window.showInformationMessage(localize('AWS.iot.revokeCert.success', 'Revoked {0}', node.certificate.id))
    } catch (e) {
        getLogger().error(`Failed to revoke certificate ${certId}: %O`, e)
        showViewLogsMessage(localize('AWS.iot.revokeCert.error', 'Failed to revoke {0}', node.certificate.id), window)
    }

    /* Refresh both things and certificates nodes so the status is updated in
     * both trees. */
    const baseNode = getBaseNode(node.parent)
    await refreshNode(baseNode.thingFolderNode, commands)
    await refreshNode(baseNode.certFolderNode, commands)
}

function getBaseNode(node: IotThingNode | IotCertsFolderNode): IotNode {
    if (node instanceof IotThingNode) {
        return node.parent.parent
    }
    return node.parent
}

async function refreshNode(node: LoadMoreNode | undefined, commands: Commands): Promise<void> {
    if (!node) {
        return
    }
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
