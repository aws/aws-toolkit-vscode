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

export async function stopApplication(node: EmrServerlessApplicationNode, commands = Commands.vscode()): Promise<void> {
    getLogger().debug('StopApplication called for %O', node)

    const applicationId = node.application.id

    await stopWithProgress(node)
        .catch(e => {
            getLogger().error(`Failed to stop application ${applicationId}: %s`, e)
            showViewLogsMessage(
                localize('AWS.emrserverless.stopApplication.failure', 'Failed to stop application: {0}', applicationId)
            )
        })
        .finally(() => commands.execute('aws.refreshAwsExplorerNode', node.parent))
    getLogger().info(`stopped application: ${applicationId}`)

    // vscode.window.showInformationMessage(
    //     localize('AWS.emrserverless.stopApplication.success', 'Stopped application: {0}', applicationId)
    // )
}

async function stopWithProgress(node: EmrServerlessApplicationNode): Promise<void> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize(
                'AWS.emrserverless.stopApplication.progressTitle',
                'Stopping {0}...',
                node.application.name ?? node.application.id
            ),
        },
        () => {
            return node.stopApplication()
        }
    )
}
