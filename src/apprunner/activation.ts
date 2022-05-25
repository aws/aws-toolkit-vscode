/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { AppRunnerServiceNode } from './explorer/apprunnerServiceNode'
import { getLogger } from '../shared/logger/logger'
import { createAppRunnerService } from './commands/createService'
import { createFromEcr } from './commands/createServiceFromEcr'
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { instrument, MetricName } from '../shared/telemetry/recorder'

const localize = nls.loadMessageBundle()

interface CommandMetadata {
    readonly errorMessage: string
    readonly metricName: MetricName
}

const commandMap = new Map<string, CommandMetadata & { readonly command: (...args: any[]) => unknown }>()

commandMap.set('aws.apprunner.createService', {
    command: createAppRunnerService,
    metricName: 'ApprunnerCreateService',
    errorMessage: localize('aws.apprunner.createService.failed', 'Failed to create App Runner service'),
})

commandMap.set('aws.apprunner.createServiceFromEcr', {
    command: createFromEcr,
    metricName: 'ApprunnerCreateService',
    errorMessage: localize('aws.apprunner.createEcr.failed', 'Failed to create App Runner service from ECR'),
})

commandMap.set('aws.apprunner.pauseService', {
    command: (node: AppRunnerServiceNode) => node.pause(),
    metricName: 'ApprunnerPauseService',
    errorMessage: localize('aws.apprunner.pauseService.failed', 'Failed to pause App Runner service'),
})

commandMap.set('aws.apprunner.resumeService', {
    command: (node: AppRunnerServiceNode) => node.resume(),
    metricName: 'ApprunnerResumeService',
    errorMessage: localize('aws.apprunner.resumeService.failed', 'Failed to resume App Runner service'),
})

commandMap.set('aws.apprunner.copyServiceUrl', {
    command: (node: AppRunnerServiceNode) => vscode.env.clipboard.writeText(node.url),
    metricName: 'ApprunnerCopyServiceUrl',
    errorMessage: localize('aws.apprunner.copyServiceUrl.failed', 'Failed to copy App Runner service URL'),
})

commandMap.set('aws.apprunner.open', {
    command: (node: AppRunnerServiceNode) => vscode.env.openExternal(vscode.Uri.parse(node.url)),
    metricName: 'ApprunnerOpenServiceUrl',
    errorMessage: localize('aws.apprunner.open.failed', 'Failed to open App Runner service'),
})

commandMap.set('aws.apprunner.startDeployment', {
    command: (node: AppRunnerServiceNode) => node.deploy(),
    metricName: 'ApprunnerStartDeployment',
    errorMessage: localize('aws.apprunner.deploy.failed', 'Failed to start deployment of App Runner service'),
})

commandMap.set('aws.apprunner.deleteService', {
    command: (node: AppRunnerServiceNode) => node.delete(),
    metricName: 'ApprunnerDeleteService',
    errorMessage: localize('aws.apprunner.deleteService.failed', 'Failed to delete App Runner service'),
})

/**
 * Activates App Runner
 */
export async function activate(context: ExtContext): Promise<void> {
    function register(id: string, fn: (...args: any[]) => unknown, metadata: CommandMetadata) {
        const withTelem = instrument(metadata.metricName, async (...args: any[]) => {
            try {
                await fn(...args)
            } catch (err) {
                getLogger().error(`${metadata.errorMessage}: %O`, err)
                showViewLogsMessage(metadata.errorMessage)
            }
        })

        return Commands.register(id, withTelem)
    }

    const registeredCommands = Array.from(commandMap.entries()).map(([id, data]) => register(id, data.command, data))
    context.extensionContext.subscriptions.push(...registeredCommands)
}
