/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showConfirmationMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DBInstanceNode } from '../explorer/dbInstanceNode'
import { assertNodeAvailable } from '../utils'

/**
 * Reboots a DocumentDB instance.
 * Refreshes the parent node.
 */
export async function rebootInstance(node: DBInstanceNode) {
    getLogger().debug('docdb: RebootInstance called for: %O', node)

    await telemetry.docdb_rebootInstance.run(async () => {
        assertNodeAvailable(node, 'RebootInstance')

        const isConfirmed = await showConfirmationMessage({
            prompt: localize(
                'AWS.docdb.rebootInstance.prompt',
                'Are you sure you want to reboot instance {0}?',
                node.name
            ),
            confirm: localizedText.yes,
            cancel: localizedText.cancel,
        })
        if (!isConfirmed) {
            getLogger().debug('docdb: RebootInstance canceled')
            throw new CancellationError('user')
        }

        const instanceName = node.instance.DBInstanceIdentifier
        try {
            const instance = await node.rebootInstance()

            getLogger().info('docdb: Rebooting instance: %s', instanceName)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.rebootInstance.success', 'Rebooting instance: {0}', instanceName)
            )

            node.parent.refresh()
            return instance
        } catch (e) {
            getLogger().error(`docdb: Failed to reboot instance ${instanceName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.rebootInstance.error', 'Failed to reboot instance: {0}', instanceName)
            )
            throw ToolkitError.chain(e, `Failed to reboot instance ${instanceName}`)
        }
    })
}
