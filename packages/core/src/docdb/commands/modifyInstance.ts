/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { DBInstanceNode } from '../explorer/dbInstanceNode'
import { DBCluster, ModifyDBInstanceMessage } from '@aws-sdk/client-docdb'
import { DBStorageType, DocumentDBClient } from '../../shared/clients/docdbClient'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { isValidResponse } from '../../shared/wizards/wizard'
import { telemetry } from '../../shared/telemetry/telemetry'
import { assertNodeAvailable } from '../utils'

/**
 * Modifies a DocumentDB instance.
 *
 * Prompts the user for the instance class.
 * Updates the instance.
 * Refreshes the node.
 */
export async function modifyInstance(node: DBInstanceNode) {
    getLogger().debug('docdb: ModifyInstance called for: %O', node)

    await telemetry.docdb_resizeInstance.run(async () => {
        assertNodeAvailable(node, 'ModifyInstance')
        const instanceName = node.instance.DBInstanceIdentifier
        const parent = node.parent

        const quickPickItems = await getInstanceClassOptions(parent.client, parent.cluster)
        const newInstanceClass = await promptForInstanceClass(quickPickItems, node.instance.DBInstanceClass ?? '')

        if (!newInstanceClass) {
            getLogger().debug('docdb: ModifyInstance cancelled')
            throw new ToolkitError('User cancelled modifyInstance wizard', { cancelled: true })
        }

        try {
            const request: ModifyDBInstanceMessage = {
                DBInstanceIdentifier: instanceName,
                DBInstanceClass: newInstanceClass,
                ApplyImmediately: true,
            }

            const instance = await parent.client.modifyInstance(request)

            getLogger().info('docdb: Modified instance: %O', instanceName)
            void vscode.window.showInformationMessage(
                localize('AWS.docdb.modifyInstance.success', 'Modified instance: {0}', instanceName)
            )

            await node.waitUntilStatusChanged()
            parent.refresh()
            return instance
        } catch (e) {
            getLogger().error(`docdb: Failed to modify instance ${instanceName}: %s`, e)
            void showViewLogsMessage(
                localize('AWS.docdb.modifyInstance.error', 'Failed to modify instance: {0}', instanceName)
            )
            throw ToolkitError.chain(e, `Failed to modify instance ${instanceName}`)
        }
    })
}

async function getInstanceClassOptions(
    client: DocumentDBClient,
    cluster: DBCluster
): Promise<DataQuickPickItem<string>[]> {
    const options = await client.listInstanceClassOptions(
        cluster.EngineVersion,
        cluster.StorageType ?? DBStorageType.Standard
    )

    const items: DataQuickPickItem<string>[] = options.map((option) => {
        return {
            data: option.DBInstanceClass,
            label: option.DBInstanceClass ?? '(unknown)',
        }
    })

    return items
}

async function promptForInstanceClass(items: any[], currentValue: string) {
    const prompter = createQuickPick<string>(items, {
        title: localize('AWS.docdb.createInstance.instanceClass.prompt', 'Select instance class'),
        value: currentValue,
    })

    prompter.recentItem = items.find((item) => item.data === currentValue)

    const response = await prompter.prompt()
    return isValidResponse(response) ? response : undefined
}
