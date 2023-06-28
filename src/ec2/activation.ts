/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { tryConnect } from './commands'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.connectToInstance', async (node?: Ec2InstanceNode) => {
            await (node ? tryConnect(node.toSelection()) : tryConnect())
        })
    )
}
