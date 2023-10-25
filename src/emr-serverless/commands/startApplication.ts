/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { EmrServerlessApplicationNode } from '../explorer/emrServerlessApplicationNode'
import { Commands } from '../../shared/vscode/commands'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../shared/utilities/messages'

export async function startApplication(
    node: EmrServerlessApplicationNode,
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('EMR Serverless: StartApplication called for %O', node)

    const applicationId = node.application.id

    await startWithProgress(node)
        .catch(e => {
            getLogger().error(`Failed to start application ${applicationId}: %s`, e)
            showViewLogsMessage(
                localize(
                    'AWS.emrserverless.startApplication.failure',
                    'Failed to start application: {0}',
                    applicationId
                )
            )
        })
        .finally(() => commands.execute('aws.refreshAwsExplorerNode', node.parent))
    getLogger().info(`EMR Serverless: started application: ${applicationId}`)

    // vscode.window.showInformationMessage(
    //     localize('AWS.emrserverless.startApplication.success', 'Started application: {0}', applicationId)
    // )
}

async function startWithProgress(node: EmrServerlessApplicationNode): Promise<void> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize(
                'AWS.emrserverless.startApplication.progressTitle',
                'Starting {0}...',
                node.application.name ?? node.application.id
            ),
        },
        () => {
            return node.startApplication()
        }
    )
}
