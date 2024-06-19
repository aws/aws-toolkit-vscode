/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { getLogger } from '../../shared/logger'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { IotPolicyVersionNode } from '../explorer/iotPolicyVersionNode'
import { showViewLogsMessage } from '../../shared/utilities/messages'

export async function viewPolicyVersionCommand(node: IotPolicyVersionNode) {
    getLogger().debug('viewPolicyVersion called for %O', node)

    const policyVersionId = node.version.versionId!
    const policyName = node.policy.name

    try {
        const policy = await node.iot.getPolicyVersion({ policyName, policyVersionId })
        const document = policy.policyDocument!

        await showPolicyContent(document)
    } catch (e) {
        getLogger().error('Failed to retrieve policy document')
        void showViewLogsMessage(localize('AWS.iot.viewPolicyVersion.error', 'Failed to retrieve policy document'))
        return undefined
    }
}

export function policyFormatter(rawPolicyContent: string, tabSize: number = getTabSizeSetting()): string {
    const prettyPolicyContent = JSON.stringify(JSON.parse(rawPolicyContent), undefined, tabSize)

    return prettyPolicyContent
}

export async function showPolicyContent(
    rawPolicyContent: string,
    tabSize: number = getTabSizeSetting()
): Promise<void> {
    const prettyPolicyContent = policyFormatter(rawPolicyContent, tabSize)
    const newDoc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: prettyPolicyContent,
    })
    await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.One, false)
}
