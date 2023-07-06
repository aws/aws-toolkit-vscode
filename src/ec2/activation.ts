/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { tryConnect } from './commands'
import { telemetry } from '../shared/telemetry/telemetry'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { copyTextCommand } from '../awsexplorer/commands/copyText'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.connectToInstance', async (node?: Ec2InstanceNode) => {
            await telemetry.ec2_connectToInstance.run(async span => {
                span.record({ ec2ConnectionType: 'ssm' })
                await (node ? tryConnect(node.toSelection()) : tryConnect())
            })
        }),

        Commands.register('aws.ec2.copyInstanceId', async (node: Ec2InstanceNode) => {
            await copyTextCommand(node, 'id')
        })
    )
}
