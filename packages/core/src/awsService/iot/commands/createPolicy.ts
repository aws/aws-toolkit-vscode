/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { IotPolicyFolderNode } from '../explorer/iotPolicyFolderNode'
import { fs } from '../../../shared'

/**
 * Creates a policy from a policy document.
 */
export async function createPolicyCommand(node: IotPolicyFolderNode, getPolicyDoc = getPolicyDocument): Promise<void> {
    getLogger().debug('CreatePolicy called for %O', node)

    const data = await getPolicyDoc()
    if (!data) {
        return
    }

    const policyName = await vscode.window.showInputBox({
        prompt: localize('AWS.iot.createPolicy.prompt', 'Enter a new policy name'),
        placeHolder: localize('AWS.iot.createPolicy.placeHolder', 'Policy Name'),
        validateInput: validatePolicyName,
    })

    if (!policyName) {
        getLogger().info('CreatePolicy canceled')
        return
    }

    try {
        // Parse to ensure this is a valid JSON
        const policyJSON = JSON.parse(data.toString())
        await node.iot.createPolicy({ policyName, policyDocument: JSON.stringify(policyJSON) })
        void vscode.window.showInformationMessage(
            localize('AWS.iot.createPolicy.success', 'Created Policy {0}', policyName)
        )
    } catch (e) {
        getLogger().error('Failed to create policy document: %s', e)
        void showViewLogsMessage(localize('AWS.iot.createPolicy.error', 'Failed to create policy {0}', policyName))
        return
    }

    // Refresh the Policy Folder node
    await node.refreshNode()
}

export async function getPolicyDocument(): Promise<Uint8Array | undefined> {
    const fileLocation = await vscode.window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        filters: { JSON: ['json'] },
    })

    if (!fileLocation || fileLocation.length === 0) {
        getLogger().info('CreatePolicy canceled: No document selected')
        return undefined
    }

    const policyLocation = fileLocation[0]

    let data: Uint8Array
    try {
        data = await fs.readFileBytes(policyLocation.fsPath)
    } catch (e) {
        getLogger().error('Failed to read policy document: %s', e)
        void showViewLogsMessage(localize('AWS.iot.createPolicy.error', 'Failed to read policy document'))
        return undefined
    }

    return data
}

/**
 * Validates a Policy name for the CreatePolicy API. See
 * https://docs.aws.amazon.com/iot/latest/apireference/API_CreatePolicy.html
 * for more information. Pattern: `[\w+=,.@-]+`.
 */
function validatePolicyName(name: string): string | undefined {
    if (name.length < 1 || name.length > 128) {
        return localize(
            'AWS.iot.validatePolicyName.error.invalidLength',
            'Policy name must be between 1 and 128 characters long'
        )
    }
    if (!/^[\w+=,.@-]+$/.test(name)) {
        return localize(
            'AWS.iot.validatePolicyName.error.invalidCharacters',
            'Policy name must contain only alphanumeric characters and/or the following: +=.,@-'
        )
    }
    return undefined
}
