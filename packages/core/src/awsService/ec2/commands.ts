/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2Node } from './explorer/ec2ParentNode'
import { SafeEc2Instance, Ec2Client } from '../../shared/clients/ec2Client'
import { Ec2ConnectionManagerMap } from './activation'
import { getConnectionManager, getSelection } from './utils'

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
