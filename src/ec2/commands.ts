/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstanceStateManager, getStateManagerForSelection } from './instanceStateManager'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { Ec2Node } from './explorer/ec2ParentNode'
import { Ec2ConnectionManager } from './model'
import { Ec2Prompter, instanceFilter } from './prompter'
import { Ec2Selection } from './utils'
import { Ec2Instance } from '../shared/clients/ec2Client'
import { copyToClipboard } from '../shared/utilities/messages'

export async function openTerminal(node?: Ec2Node) {
    const selection = await getSelection(node)

    const connectionManager = new Ec2ConnectionManager(selection.region)
    await connectionManager.attemptToOpenEc2Terminal(selection)
}

export async function openRemoteConnection(node?: Ec2Node) {
    const selection = await getSelection(node)
    //const connectionManager = new Ec2ConnectionManager(selection.region)
    console.log(selection)
}

export async function startInstance(node?: Ec2Node) {
    const prompterFilter = (instance: Ec2Instance) => instance.status !== 'running'
    const stateManager = await getStateManager(node, prompterFilter)
    await stateManager.startInstanceWithCancel()
}

export async function stopInstance(node?: Ec2Node) {
    const prompterFilter = (instance: Ec2Instance) => instance.status !== 'stopped'
    const stateManager = await getStateManager(node, prompterFilter)
    await stateManager.stopInstanceWithCancel()
}

export async function rebootInstance(node?: Ec2Node) {
    const stateManager = await getStateManager(node)
    await stateManager.rebootInstanceWithCancel()
}

async function getStateManager(node?: Ec2Node, prompterFilter?: instanceFilter): Promise<InstanceStateManager> {
    const selection = await getSelection(node, prompterFilter)
    const stateManager = getStateManagerForSelection(selection)
    return stateManager
}

async function getSelection(node?: Ec2Node, filter?: instanceFilter): Promise<Ec2Selection> {
    const prompter = new Ec2Prompter(filter)
    const selection = node && node instanceof Ec2InstanceNode ? node.toSelection() : await prompter.promptUser()
    return selection
}

export async function copyInstanceId(instanceId: string): Promise<void> {
    await copyToClipboard(instanceId, 'Id')
}
