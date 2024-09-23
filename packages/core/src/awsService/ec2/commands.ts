/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2Node } from './explorer/ec2ParentNode'
import { SafeEc2Instance, Ec2Client } from '../../shared/clients/ec2Client'
import { Ec2ConnectionManagerMap } from './activation'
import { copyToClipboard } from '../../shared/utilities/messages'
import { getAwsConsoleUrl } from '../../shared/awsConsole'
import { showRegionPrompter } from '../../auth/utils'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { Ec2Prompter, Ec2Selection, instanceFilter } from './prompter'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { Ec2ConnectionManager } from './model'

export async function openTerminal(connectionManagers: Ec2ConnectionManagerMap, node?: Ec2Node) {
    const selection = await getSelection(node)
    const connectionManager = await getConnectionManager(connectionManagers, selection)
    await connectionManager.attemptToOpenEc2Terminal(selection)
}

export async function openRemoteConnection(connectionManagers: Ec2ConnectionManagerMap, node?: Ec2Node) {
    const selection = await getSelection(node)
    const connectionManager = await getConnectionManager(connectionManagers, selection)
    await connectionManager.tryOpenRemoteConnection(selection)
}

export async function startInstance(node?: Ec2Node) {
    const prompterFilter = (instance: SafeEc2Instance) => instance.LastSeenStatus !== 'running'
    const selection = await getSelection(node, prompterFilter)
    const client = new Ec2Client(selection.region)
    await client.startInstanceWithCancel(selection.instanceId)
}

export async function stopInstance(node?: Ec2Node) {
    const prompterFilter = (instance: SafeEc2Instance) => instance.LastSeenStatus !== 'stopped'
    const selection = await getSelection(node, prompterFilter)
    const client = new Ec2Client(selection.region)
    await client.stopInstanceWithCancel(selection.instanceId)
}

export async function rebootInstance(node?: Ec2Node) {
    const selection = await getSelection(node)
    const client = new Ec2Client(selection.region)
    await client.rebootInstanceWithCancel(selection.instanceId)
}

export async function linkToLaunchInstance(node?: Ec2Node) {
    const region = node ? node.regionCode : (await showRegionPrompter('Select Region', '')).id
    const url = getAwsConsoleUrl('ec2-launch', region)
    await openUrl(url)
}

async function getSelection(node?: Ec2Node, filter?: instanceFilter): Promise<Ec2Selection> {
    const prompter = new Ec2Prompter(filter)
    const selection = node && node instanceof Ec2InstanceNode ? node.toSelection() : await prompter.promptUser()
    return selection
}

export async function copyInstanceId(instanceId: string): Promise<void> {
    await copyToClipboard(instanceId, 'Id')
}

export async function getConnectionManager(
    connectionManagers: Ec2ConnectionManagerMap,
    selection: Ec2Selection
): Promise<Ec2ConnectionManager> {
    if (connectionManagers.has(selection.region)) {
        return connectionManagers.get(selection.region)!
    } else {
        const newConnectionManager = new Ec2ConnectionManager(selection.region)
        connectionManagers.set(selection.region, newConnectionManager)
        return newConnectionManager
    }
}
