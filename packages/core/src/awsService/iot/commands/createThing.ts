/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { IotThingFolderNode } from '../explorer/iotThingFolderNode'

/**
 * Creates an IoT Thing.
 *
 * Prompts the user for the thing name.
 * Creates the thing.
 * Refreshes the node.
 */
export async function createThingCommand(node: IotThingFolderNode): Promise<void> {
    getLogger().debug('CreateThing called for: %O', node)

    const thingName = await vscode.window.showInputBox({
        prompt: localize('AWS.iot.createThing.prompt', 'Enter a new Thing name'),
        placeHolder: localize('AWS.iot.createThing.placeHolder', 'Thing Name'),
        validateInput: validateThingName,
    })

    if (!thingName) {
        getLogger().info('CreateThing canceled')
        return
    }

    getLogger().info(`Creating thing: ${thingName}`)
    try {
        const thing = await node.iot.createThing({ thingName })

        getLogger().info('Created thing: %O', thing)
        void vscode.window.showInformationMessage(
            localize('AWS.iot.createThing.success', 'Created Thing {0}', thingName)
        )
    } catch (e) {
        getLogger().error(`Failed to create Thing ${thingName}: %s`, e)
        void showViewLogsMessage(localize('AWS.iot.createThing.error', 'Failed to create Thing: {0}', thingName))
    }

    // Refresh the Things Folder node
    await node.refreshNode()
}

/**
 * Validates a Thing name for the CreateThing API. See
 * https://docs.aws.amazon.com/iot/latest/apireference/API_CreateThing.html
 * for more information. Pattern: `[a-zA-Z0-9:_-]+`.
 */
function validateThingName(name: string): string | undefined {
    if (name.length < 1 || name.length > 128) {
        return localize(
            'AWS.iot.validateThingName.error.invalidLength',
            'Thing name must be between 1 and 128 characters long'
        )
    }
    if (!/^[a-zA-Z0-9:_-]+$/.test(name)) {
        return localize(
            'AWS.iot.validateThingName.error.invalidCharacters',
            'Thing name must only contain alphanumeric characters, hyphens, underscores, or colons'
        )
    }
    return undefined
}
