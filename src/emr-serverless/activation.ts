/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { EmrServerlessJobNode } from './explorer/emrServerlessJobNode'
import { getDashboard } from './commands/getDashboard'
import { Commands } from '../shared/vscode/commands2'
import { EmrServerlessApplicationNode } from './explorer/emrServerlessApplicationNode'
import { copyTextCommand } from '../awsexplorer/commands/copyText'
import { startApplication } from './commands/startApplication'
import { stopApplication } from './commands/stopApplication'

/**
 * Activates EMR Serverless components.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(
        Commands.register('aws.emrserverless.getDashboard', async (node: EmrServerlessJobNode) => {
            await getDashboard(node)
        }),

        Commands.register(
            'aws.emrserverless.copyId',
            async (node: EmrServerlessApplicationNode | EmrServerlessJobNode) => {
                await copyTextCommand(node, 'id')
            }
        ),

        Commands.register('aws.emrserverless.startApplication', async (node: EmrServerlessApplicationNode) => {
            await startApplication(node)
        }),

        Commands.register('aws.emrserverless.stopApplication', async (node: EmrServerlessApplicationNode) => {
            await stopApplication(node)
        })
    )
}
