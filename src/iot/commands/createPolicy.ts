/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import { getLogger } from '../../shared/logger'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { IotPolicyFolderNode } from '../explorer/iotPolicyFolderNode'

/**
 * Creates a policy from a policy document.
 */
export async function createPolicyCommand(
    node: IotPolicyFolderNode,
    getPolicyDoc = getPolicyDocument,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('CreatePolicy called for %O', node)

    const policyName = await window.showInputBox({
        prompt: localize('AWS.iot.createPolicy.prompt', 'Enter a new policy name'),
        placeHolder: localize('AWS.iot.createPolicy.placeHolder', 'Policy Name'),
    })

    if (!policyName) {
        getLogger().info('CreatePolicy canceled')
        return
    }

    const data = await getPolicyDoc(window)
    if (!data) {
        return
    }

    try {
        //Parse to ensure this is a valid JSON
        const policyJSON = JSON.parse(data.toString())
        await node.iot.createPolicy({ policyName, policyDocument: JSON.stringify(policyJSON) })
        window.showInformationMessage(localize('AWS.iot.createPolicy.success', 'Created Policy {0}', policyName))
    } catch (e) {
        getLogger().error('Failed to create policy document: %O', e)
        showViewLogsMessage(localize('AWS.iot.createPolicy.error', 'Failed to create policy {0}', policyName), window)
        return
    }

    //Refresh the Policy Folder node
    await node.refreshNode(commands)
}

export async function getPolicyDocument(window: Window): Promise<Buffer | undefined> {
    const fileLocation = await window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        filters: { JSON: ['json'] },
    })

    if (!fileLocation || fileLocation.length == 0) {
        getLogger().info('CreatePolicy canceled: No document selected')
        return undefined
    }

    const policyLocation = fileLocation[0]

    let data: Buffer
    try {
        data = await fs.readFile(policyLocation.fsPath)
    } catch (e) {
        getLogger().error('Failed to read policy document: %O', e)
        showViewLogsMessage(localize('AWS.iot.createPolicy.error', 'Failed to read policy document'), window)
        return undefined
    }

    return data
}
