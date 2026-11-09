/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { assertNodeAvailable, validateInstanceName } from '../utils'
import { DBInstanceNode } from '../explorer/dbInstanceNode'
import { telemetry } from '../../shared/telemetry/telemetry'

/**
 * Renames a DocumentDB instance.
 *
 * Prompts the user for the new instance name
 * Updates the instance.
 * Refreshes the node.
 */
export async function renameInstance(node: DBInstanceNode) {
    getLogger().debug('docdb: RenameInstance called for: %O', node)

    await telemetry.docdb_renameInstance.run(async () => {
        assertNodeAvailable(node, 'RenameInstance')
        const instanceName = node.instance.DBInstanceIdentifier

        const newInstanceName = await vscode.window.showInputBox({
            prompt: localize('AWS.docdb.renameInstance.prompt', 'New instance name'),
            value: instanceName,
            validateInput: validateInstanceName,
        })

        if (!newInstanceName) {
            getLogger().debug('docdb: RenameInstance cancelled')
            throw new ToolkitError('User cancelled renameInstance', { cancelled: true })
        }

        try {
            const instance = await node.renameInstance(newInstanceName)

            getLogger().info('docdb: Renamed instance: %O', instance)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.renameInstance.success', 'Updated instance: {0}', instanceName)
            )

            node.refresh()
            return instance
        } catch (e) {
            getLogger().error(`docdb: Failed to rename instance ${instanceName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.renameInstance.error', 'Failed to rename instance: {0}', instanceName)
            )
            throw ToolkitError.chain(e, `Failed to rename instance ${instanceName}`)
        }
    })
}
