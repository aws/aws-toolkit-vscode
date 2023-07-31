/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { telemetry } from '../shared/telemetry/telemetry'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { promptUserForEc2Selection } from './prompter'
import { Ec2ConnectionManager } from './model'
import { copyTextCommand } from '../awsexplorer/commands/copyText'
import { Ec2Node } from './explorer/ec2ParentNode'
import { openRemoteConnection } from './commands'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.openTerminal', async (node?: Ec2InstanceNode) => {
            await telemetry.ec2_connectToInstance.run(async span => {
                span.record({ ec2ConnectionType: 'ssm' })
                const selection = node ? node.toSelection() : await promptUserForEc2Selection()

                const connectionManager = new Ec2ConnectionManager(selection.region)
                await connectionManager.attemptToOpenEc2Terminal(selection)
            })
        }),

        Commands.register('aws.ec2.copyInstanceId', async (node: Ec2InstanceNode) => {
            await copyTextCommand(node, 'id')
        }),

        Commands.register('aws.ec2.openRemoteConnection', async (node?: Ec2Node) => {
            await openRemoteConnection(node)
        })
    )
}
