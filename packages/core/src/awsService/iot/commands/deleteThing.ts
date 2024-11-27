/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../../shared/localizedText'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { IotThingNode } from '../explorer/iotThingNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../../shared/utilities/messages'

/**
 * Deletes the thing represented by the given node.
 *
 * Prompts the user for confirmation.
 * Deletes the thing.
 * Refreshes the parent node.
 */
export async function deleteThingCommand(node: IotThingNode): Promise<void> {
    getLogger().debug('DeleteThing called for %O', node)

    const thingName = node.thing.name

    const isConfirmed = await showConfirmationMessage({
        prompt: localize('AWS.iot.deleteThing.prompt', 'Are you sure you want to delete Thing {0}?', thingName),
        confirm: localizedText.localizedDelete,
        cancel: localizedText.cancel,
    })
    if (!isConfirmed) {
        getLogger().info('DeleteThing canceled')
        return
    }

    getLogger().info(`Deleting thing ${thingName}`)
    try {
        const principalList = (await node.iot.listThingPrincipals({ thingName })).principals
        if (principalList?.length ?? 0 > 0) {
            getLogger().error(`Thing ${thingName} has attached principals: %O`, principalList)
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.iot.deleteThing.error',
                    'Cannot delete Thing {0}. Thing {0} has attached principals: {1}',
                    thingName,
                    principalList?.join(', ')
                )
            )
            return undefined
        }
        await node.iot.deleteThing({ thingName })

        getLogger().info(`deleted Thing: ${thingName}`)
        void vscode.window.showInformationMessage(
            localize('AWS.iot.deleteThing.success', 'Deleted Thing: {0}', thingName)
        )
    } catch (e) {
        getLogger().error(`Failed to delete Thing: ${thingName}: %s`, e)
        void showViewLogsMessage(localize('AWS.iot.deleteThing.error', 'Failed to delete Thing: {0}', thingName))
    }

    // Refresh the Things Folder node
    await node.parent.refreshNode()
}
