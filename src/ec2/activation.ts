/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { telemetry } from '../shared/telemetry/telemetry'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { copyTextCommand } from '../awsexplorer/commands/copyText'
import { Ec2Node } from './explorer/ec2ParentNode'
import { openRemoteConnection, openTerminal } from './commands'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.openTerminal', async (node?: Ec2Node) => {
            await telemetry.ec2_connectToInstance.run(async span => {
                span.record({ ec2ConnectionType: 'ssm' })
                await (node ? openTerminal(node) : openTerminal(node))
            })
        }),

        Commands.register('aws.ec2.copyInstanceId', async (node: Ec2InstanceNode) => {
            await copyTextCommand(node, 'id')
        }),
        Commands.register('aws.ec2.openRemoteConnection', async (node?: Ec2Node) => {
            await (node ? openRemoteConnection(node) : openRemoteConnection(node))
        })
    )
}
