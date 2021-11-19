/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { Window } from '../../shared/vscode/window'
import { Commands } from '../../shared/vscode/commands'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { IotPolicyVersionNode } from '../explorer/iotPolicyVersionNode'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { IotPolicyWithVersionsNode } from '../explorer/iotPolicyNode'

/**
 * Copies the path to the folder or file represented by the given node.
 *
 * Note that the path does not contain the bucket name or a leading slash.
 */
export async function setDefaultPolicy(
    node: IotPolicyVersionNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('SetDefaultPolicy called for %O', node)

    try {
        await node.iot.setDefaultPolicyVersion({
            policyName: node.policy.name,
            policyVersionId: node.version.versionId!,
        })
        window.showInformationMessage(
            localize(
                'AWS.iot.setDefaultPolicy.success',
                'Set {0} as default version of {1}',
                node.version.versionId,
                node.policy.name
            )
        )
    } catch (e) {
        getLogger().error('Failed to set default policy version: %O', e)
        showViewLogsMessage(localize('AWS.iot.setDefaultPolicy.error', 'Failed to set default policy version'), window)
    }

    await refreshBase(node.parent, commands)
}

async function refreshBase(node: IotPolicyWithVersionsNode, commands: Commands): Promise<void> {
    const parent = node.parent
    parent.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', parent)
}
