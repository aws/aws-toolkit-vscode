/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { Commands } from '../../shared/vscode/commands2'
import { SagemakerSpaceNode } from './explorer/sagemakerSpaceNode'
import { SagemakerParentNode } from './explorer/sagemakerParentNode'
import * as uriHandlers from './uriHandlers'
import { openRemoteConnect, filterSpaceAppsByDomainUserProfiles, stopSpace } from './commands'
import { updateIdleFile, startMonitoringTerminalActivity, ActivityCheckInterval } from './utils'
import { ExtContext } from '../../shared/extensions'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isSageMaker, UserActivity } from '../../shared/extensionUtilities'

let terminalActivityInterval: NodeJS.Timeout | undefined

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        uriHandlers.register(ctx),
        Commands.register('aws.sagemaker.openRemoteConnection', async (node: SagemakerSpaceNode) => {
            if (!validateNode(node)) {
                return
            }
            await telemetry.sagemaker_openRemoteConnection.run(async () => {
                await openRemoteConnect(node, ctx.extensionContext)
            })
        }),

        Commands.register('aws.sagemaker.filterSpaceApps', async (node: SagemakerParentNode) => {
            await telemetry.sagemaker_filterSpaces.run(async () => {
                await filterSpaceAppsByDomainUserProfiles(node)
            })
        }),

        Commands.register('aws.sagemaker.stopSpace', async (node: SagemakerSpaceNode) => {
            if (!validateNode(node)) {
                return
            }
            await telemetry.sagemaker_stopSpace.run(async () => {
                await stopSpace(node, ctx.extensionContext)
            })
        })
    )

    // If running in SageMaker AI Space, track user activity for autoshutdown feature
    if (isSageMaker('SMAI')) {
        // Use /tmp/ directory so the file is cleared on each reboot to prevent stale timestamps.
        const tmpDirectory = '/tmp/'
        const idleFilePath = path.join(tmpDirectory, '.sagemaker-last-active-timestamp')

        const userActivity = new UserActivity(ActivityCheckInterval)
        userActivity.onUserActivity(() => updateIdleFile(idleFilePath))

        terminalActivityInterval = startMonitoringTerminalActivity(idleFilePath)

        // Write initial timestamp
        await updateIdleFile(idleFilePath)

        ctx.extensionContext.subscriptions.push(userActivity, {
            dispose: () => {
                if (terminalActivityInterval) {
                    clearInterval(terminalActivityInterval)
                    terminalActivityInterval = undefined
                }
            },
        })
    }
}

/**
 * Checks if a node  is undefined and shows a warning message if so.
 */
function validateNode(node: unknown): boolean {
    if (!node) {
        void vscode.window.showWarningMessage('Space information is being refreshed. Please try again shortly.')
        return false
    }
    return true
}
