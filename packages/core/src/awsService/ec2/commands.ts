/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { Ec2Node } from './explorer/ec2ParentNode'
import { Ec2ConnectionManager } from './model'
import { Ec2Prompter, instanceFilter, Ec2Selection } from './prompter'
import { Ec2Instance, Ec2Client } from '../../shared/clients/ec2Client'
import { copyToClipboard } from '../../shared/utilities/messages'
import { getLogger } from '../../shared/logger'
import { Ec2ConnectionManagerMap } from './activation'

export function refreshExplorer(node?: Ec2Node) {
    if (node) {
        const n = node instanceof Ec2InstanceNode ? node.parent : node
        n.refreshNode().catch((e) => {
            getLogger().error('refreshNode failed: %s', (e as Error).message)
        })
    }
}

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
    const prompterFilter = (instance: Ec2Instance) => instance.status !== 'running'
    const selection = await getSelection(node, prompterFilter)
    const client = new Ec2Client(selection.region)
    await client.startInstanceWithCancel(selection.instanceId)
}

export async function stopInstance(node?: Ec2Node) {
    const prompterFilter = (instance: Ec2Instance) => instance.status !== 'stopped'
    const selection = await getSelection(node, prompterFilter)
    const client = new Ec2Client(selection.region)
    await client.stopInstanceWithCancel(selection.instanceId)
}

export async function rebootInstance(node?: Ec2Node) {
    const selection = await getSelection(node)
    const client = new Ec2Client(selection.region)
    await client.rebootInstanceWithCancel(selection.instanceId)
}

async function getSelection(node?: Ec2Node, filter?: instanceFilter): Promise<Ec2Selection> {
    const prompter = new Ec2Prompter(filter)
    const selection = node && node instanceof Ec2InstanceNode ? node.toSelection() : await prompter.promptUser()
    return selection
}

async function getConnectionManager(
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

export async function copyInstanceId(instanceId: string): Promise<void> {
    await copyToClipboard(instanceId, 'Id')
}
