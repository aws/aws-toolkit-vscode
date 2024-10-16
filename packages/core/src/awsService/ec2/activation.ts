/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ExtContext } from '../../shared/extensions'
import { Commands } from '../../shared/vscode/commands2'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { copyTextCommand } from '../../awsexplorer/commands/copyText'
import { Ec2Node } from './explorer/ec2ParentNode'
import {
    openRemoteConnection,
    openTerminal,
    rebootInstance,
    startInstance,
    stopInstance,
    refreshExplorer,
    openLogDocument,
    linkToLaunchInstance,
} from './commands'
import { ec2LogsScheme } from '../../shared/constants'
import { Ec2LogDocumentProvider } from './ec2LogDocumentProvider'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(ec2LogsScheme, new Ec2LogDocumentProvider())
    )
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.openTerminal', async (node?: Ec2InstanceNode) => {
            await telemetry.ec2_connectToInstance.run(async (span) => {
                span.record({ ec2ConnectionType: 'ssm' })
                await openTerminal(node)
            })
        }),

        Commands.register('aws.ec2.copyInstanceId', async (node: Ec2InstanceNode) => {
            await copyTextCommand(node, 'id')
        }),
        Commands.register('aws.ec2.viewLogs', async (node?: Ec2InstanceNode) => {
            await openLogDocument(node)
        }),

        Commands.register('aws.ec2.openRemoteConnection', async (node?: Ec2Node) => {
            await openRemoteConnection(node)
        }),

        Commands.register('aws.ec2.startInstance', async (node?: Ec2Node) => {
            await telemetry.ec2_changeState.run(async (span) => {
                span.record({ ec2InstanceState: 'start' })
                await startInstance(node)
                refreshExplorer(node)
            })
        }),

        Commands.register('aws.ec2.stopInstance', async (node?: Ec2Node) => {
            await telemetry.ec2_changeState.run(async (span) => {
                span.record({ ec2InstanceState: 'stop' })
                await stopInstance(node)
                refreshExplorer(node)
            })
        }),

        Commands.register('aws.ec2.rebootInstance', async (node?: Ec2Node) => {
            await telemetry.ec2_changeState.run(async (span) => {
                span.record({ ec2InstanceState: 'reboot' })
                await rebootInstance(node)
                refreshExplorer(node)
            })
        }),

        Commands.register('aws.ec2.linkToLaunch', async (node?: Ec2Node) => {
            await telemetry.ec2_launchInstance.run(async (span) => {
                await linkToLaunchInstance(node)
            })
        })
    )
}
