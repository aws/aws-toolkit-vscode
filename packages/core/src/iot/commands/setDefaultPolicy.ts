/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { IotPolicyVersionNode } from '../explorer/iotPolicyVersionNode'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { IotPolicyWithVersionsNode } from '../explorer/iotPolicyNode'

/**
 * Copies the path to the folder or file represented by the given node.
 *
 * Note that the path does not contain the bucket name or a leading slash.
 */
export async function setDefaultPolicy(node: IotPolicyVersionNode): Promise<void> {
    getLogger().debug('SetDefaultPolicy called for %O', node)

    try {
        await node.iot.setDefaultPolicyVersion({
            policyName: node.policy.name,
            policyVersionId: node.version.versionId!,
        })
        void vscode.window.showInformationMessage(
            localize(
                'AWS.iot.setDefaultPolicy.success',
                'Set {0} as default version of {1}',
                node.version.versionId,
                node.policy.name
            )
        )
    } catch (e) {
        getLogger().error('Failed to set default policy version: %s', e)
        void showViewLogsMessage(localize('AWS.iot.setDefaultPolicy.error', 'Failed to set default policy version'))
    }

    await refreshBase(node.parent)
}

async function refreshBase(node: IotPolicyWithVersionsNode): Promise<void> {
    return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
}
