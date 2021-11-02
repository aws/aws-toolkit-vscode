/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { IotThingFolderNode } from '../explorer/iotThingFolderNode'

/**
 * Creates an IoT Thing.
 *
 * Prompts the user for the thing name.
 * Creates the thing.
 * Refreshes the node.
 */
export async function createThingCommand(
    node: IotThingFolderNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('CreateThing called for: %O', node)

    const thingName = await window.showInputBox({
        prompt: localize('AWS.iot.createThing.prompt', 'Enter a new Thing name'),
        placeHolder: localize('AWS.iot.createThing.placeHolder', 'Thing Name'),
    })

    if (!thingName) {
        getLogger().info('CreateThing canceled')
        return
    }

    getLogger().info(`Creating thing: ${thingName}`)
    try {
        const thing = await node.iot.createThing({ thingName })

        getLogger().info('Created thing: %O', thing)
        window.showInformationMessage(localize('AWS.iot.createThing.success', 'Created Thing {0}', thingName))
    } catch (e) {
        getLogger().error(`Failed to create Thing ${thingName}: %O`, e)
        showViewLogsMessage(localize('AWS.iot.createThing.error', 'Failed to create Thing: {0}', thingName), window)
    }

    //Refresh the Things Folder node
    await node.refreshNode(commands)
}
