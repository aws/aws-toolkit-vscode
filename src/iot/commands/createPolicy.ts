/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
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

    const fileLocation = await promptForFileLocation(window)
    if (!fileLocation) {
        getLogger().info('CreatePolicy canceled: No document selected')
        return
    }

    try {
        const data = await fs.readFile(fileLocation.fsPath)
        //Parse to ensure this is a valid JSON
        const policyDocument = JSON.parse(data.toString())
        await node.iot.createPolicy({ policyName: policyName, policyDocument: JSON.stringify(policyDocument) })
    } catch (e) {
        getLogger().error('Failed to create policy document: %O', e)
        showViewLogsMessage(localize('AWS.iot.createPolicy.error', 'Failed to create policy'), window)
        return
    }

    await refreshNode(node, commands)
}

async function promptForFileLocation(window: Window): Promise<vscode.Uri | undefined> {
    const fileLocation = await window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        filters: { JSON: ['json'] },
    })

    if (!fileLocation || fileLocation.length == 0) {
        return undefined
    }

    return fileLocation[0]
}

async function refreshNode(node: IotPolicyFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
