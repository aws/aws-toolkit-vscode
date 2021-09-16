/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { IotThingNode } from '../explorer/iotThingNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotThingFolderNode } from '../explorer/iotThingFolderNode'

/**
 * Deletes the thing represented by the given node.
 *
 * Prompts the user for confirmation.
 * Deletes the thing.
 * Refreshes the parent node.
 */
export async function deleteThingCommand(
    node: IotThingNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeleteThing called for %O', node)

    const thingName = node.thing.name

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.iot.deleteThing.prompt', 'Are you sure you want to delete Thing {0}?', thingName),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeleteThing canceled')
        return
    }

    getLogger().info(`Deleting thing ${thingName}`)
    try {
        const principalList = (await node.iot.listThingPrincipals({ thingName: thingName })).principals
        if (principalList?.length ?? 0 > 0) {
            getLogger().error(`Thing ${thingName} has attached principals: %O`, principalList)
            showViewLogsMessage(
                localize('AWS.iot.deleteThing.error', 'Failed to delete Thing {0}', node.thing.name),
                window
            )
            return undefined
        }
        await node.iot.deleteThing({ thingName: thingName })

        getLogger().info(`Successfully deleted Thing ${thingName}`)
        window.showInformationMessage(localize('AWS.iot.deleteThing.success', 'Deleted Thing {0}', node.thing.name))
    } catch (e) {
        getLogger().error(`Failed to delete Thing ${thingName}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.deleteThing.error', 'Failed to delete Thing {0}', node.thing.name),
            window
        )
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: IotThingFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
