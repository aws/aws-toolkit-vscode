/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { IotPolicyWithVersionsNode } from '../explorer/iotPolicyNode'
import { getPolicyDocument } from './createPolicy'

/**
 * Creates a new policy version from a policy document.
 */
export async function createPolicyVersionCommand(
    node: IotPolicyWithVersionsNode,
    getPolicyDoc = getPolicyDocument,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('CreatePolicyVersion called for %O', node)

    const policyName = node.policy.name

    const data = await getPolicyDoc(window)
    if (!data) {
        return
    }

    try {
        //Parse to ensure this is a valid JSON
        const policyJSON = JSON.parse(data.toString())
        await node.iot.createPolicyVersion({
            policyName,
            policyDocument: JSON.stringify(policyJSON),
            setAsDefault: true,
        })
        window.showInformationMessage(
            localize('AWS.iot.createPolicy.success', 'Created new version of {0}', policyName)
        )
    } catch (e) {
        getLogger().error('Failed to create new policy version: %s', e)
        showViewLogsMessage(
            localize('AWS.iot.createPolicyVersion.error', 'Failed to create new version of {0}', policyName),
            window
        )
        return
    }

    //Refresh the node
    node.refresh()
}
