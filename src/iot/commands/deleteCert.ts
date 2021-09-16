/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotCertWithPoliciesNode } from '../explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../explorer/iotCertFolderNode'

/**
 * Deletes the certificate represented by the given node.
 *
 * Checks if certificate is not attached to any things.
 * Prompts the user for confirmation.
 * Deletes the policy.
 * Refreshes the parent node.
 */
export async function deleteCertCommand(
    node: IotCertWithPoliciesNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeleteThing called for %O', node)

    const certArn = node.certificate.arn

    if (node.certificate.activeStatus === 'ACTIVE') {
        getLogger().error('Certificate is active')
        showViewLogsMessage(localize('AWS.iot.deleteCert.activeError', 'Active certificates cannot be deleted'), window)
        return
    }

    try {
        const things = await node.iot.listThingsForCert({ principal: certArn })
        if (things.length > 0) {
            getLogger().error(`Certificate ${node.certificate.id} has attached Things`)
            showViewLogsMessage(
                localize('AWS.iot.deleteCert.attachedError', 'Certificate has attached {0}', things.toString()),
                window
            )
            return
        }
    } catch (e) {
        getLogger().error(`Failed to retrieve Things attached to cert ${node.certificate.id}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.deleteCert.retrieveError', 'Failed to retrieve {0} attached to certificate', 'Things'),
            window
        )
        return
    }

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.iot.deleteCert.prompt',
                'Are you sure you want to delete Certificate {0}?',
                node.certificate.id
            ),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeleteCert canceled')
        return
    }

    let forceDelete: boolean = false
    try {
        const policies = (await node.iot.listPrincipalPolicies({ principal: certArn })).policies
        if (policies?.length ?? 0 > 0) {
            forceDelete = await showConfirmationMessage(
                {
                    prompt: localize(
                        'AWS.iot.deleteCert.attachedError',
                        'Certificate has attached {0}',
                        'policies. Delete anyway?'
                    ),
                    confirm: localizedText.localizedDelete,
                    cancel: localizedText.cancel,
                },
                window
            )
            if (!forceDelete) {
                getLogger().info('DeleteCert canceled')
                return
            }
        }
    } catch (e) {
        getLogger().error(`Failed to retrieve Policies attached to cert ${node.certificate.id}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.deleteCert.retrieveError', 'Failed to retrieve {0} attached to certificate', 'policies'),
            window
        )
    }

    getLogger().info(`Deleting certificate ${node.certificate.id}`)
    try {
        await node.iot.deleteCertificate({ certificateId: node.certificate.id, forceDelete: forceDelete })

        getLogger().info(`Successfully deleted Certificate ${node.certificate.id}`)
        window.showInformationMessage(
            localize('AWS.iot.deleteCert.success', 'Deleted Certificate {0}', node.certificate.id)
        )
    } catch (e) {
        getLogger().error(`Failed to delete Certificate ${node.certificate.id}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.deleteCert.error', 'Failed to delete Certificate {0}', node.certificate.id),
            window
        )
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: IotCertsFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
