/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { Ec2Node } from './explorer/ec2ParentNode'
import { Ec2ConnectionManager } from './model'
import { promptUserForEc2Selection } from './prompter'

export async function openTerminal(node?: Ec2Node) {
    const selection = node instanceof Ec2InstanceNode ? node.toSelection() : await promptUserForEc2Selection()

    const connectionManager = new Ec2ConnectionManager(selection.region)
    await connectionManager.attemptToOpenEc2Terminal(selection)
}

export async function openRemoteConnection(node?: Ec2Node) {
    const selection = node instanceof Ec2InstanceNode ? node.toSelection() : await promptUserForEc2Selection()
    //const connectionManager = new Ec2ConnectionManager(selection.region)
    console.log(selection)
}

export async function startInstance(node?: Ec2Node) {
    const selection = node instanceof Ec2InstanceNode ? node.toSelection() : await promptUserForEc2Selection()
    console.log(selection)
}
