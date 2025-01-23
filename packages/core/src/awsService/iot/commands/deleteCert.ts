/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../../shared/localizedText'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage, showConfirmationMessage } from '../../../shared/utilities/messages'
import { IotCertWithPoliciesNode } from '../explorer/iotCertificateNode'

/**
 * Deletes the certificate represented by the given node.
 *
 * Checks if certificate is not attached to any things.
 * Prompts the user for confirmation.
 * Deletes the policy.
 * Refreshes the parent node.
 */
export async function deleteCertCommand(node: IotCertWithPoliciesNode): Promise<void> {
    getLogger().debug('DeleteThing called for %O', node)

    const certArn = node.certificate.arn

    if (node.certificate.activeStatus === 'ACTIVE') {
        getLogger().error('Certificate is active')
        void vscode.window.showErrorMessage(
            localize('AWS.iot.deleteCert.activeError', 'Active certificates cannot be deleted')
        )
        return
    }

    try {
        const things = await node.iot.listThingsForCert({ principal: certArn })
        if (things.length > 0) {
            getLogger().error(`Certificate ${node.certificate.id} has attached Things`)
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.iot.deleteCert.attachedError',
                    'Cannot delete certificate. Certificate has attached resources: {0}',
                    things.join(', ')
                )
            )
            return
        }
    } catch (e) {
        getLogger().error(`Failed to retrieve Things attached to cert ${node.certificate.id}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.iot.deleteCert.retrieveError', 'Failed to retrieve {0} attached to certificate', 'Things')
        )
        return
    }

    const isConfirmed = await showConfirmationMessage({
        prompt: localize(
            'AWS.iot.deleteCert.prompt',
            'Are you sure you want to delete Certificate {0}?',
            node.certificate.id
        ),
        confirm: localizedText.localizedDelete,
        cancel: localizedText.cancel,
    })
    if (!isConfirmed) {
        getLogger().info('DeleteCert canceled')
        return
    }

    let forceDelete: boolean = false
    try {
        const policies = (await node.iot.listPrincipalPolicies({ principal: certArn })).policies
        if (policies?.length ?? 0 > 0) {
            forceDelete = await showConfirmationMessage({
                prompt: localize(
                    'AWS.iot.deleteCert.attachedError',
                    'Certificate has attached {0}',
                    'policies. Delete anyway?'
                ),
                confirm: localizedText.localizedDelete,
                cancel: localizedText.cancel,
            })
            if (!forceDelete) {
                getLogger().info('DeleteCert canceled')
                return
            }
        }
    } catch (e) {
        getLogger().error(`Failed to retrieve Policies attached to cert ${node.certificate.id}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.iot.deleteCert.retrieveError', 'Failed to retrieve {0} attached to certificate', 'policies')
        )
    }

    getLogger().info(`Deleting certificate ${node.certificate.id}`)
    try {
        await node.iot.deleteCertificate({ certificateId: node.certificate.id, forceDelete: forceDelete })

        getLogger().info(`deleted certificate: ${node.certificate.id}`)
        void vscode.window.showInformationMessage(
            localize('AWS.iot.deleteCert.success', 'Deleted certificate: {0}', node.certificate.id)
        )
    } catch (e) {
        getLogger().error(`Failed to delete Certificate ${node.certificate.id}: %s`, e)
        void showViewLogsMessage(
            localize('AWS.iot.deleteCert.error', 'Failed to delete certificate: {0}', node.certificate.id)
        )
    }

    // Refresh the Certificate Folder node
    await node.parent.refreshNode()
}
