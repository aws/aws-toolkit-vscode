/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { AppRunnerServiceNode } from './explorer/apprunnerServiceNode'
import { getLogger } from '../shared/logger/logger'
import { createAppRunnerService } from './commands/createService'
import { pauseService } from './commands/pauseService'
import { deleteService } from './commands/deleteService'
import { createFromEcr } from './commands/createServiceFromEcr'
import { ExtContext } from '../shared/extensions'
import { copyToClipboard } from '../shared/utilities/messages'
import { Commands } from '../shared/vscode/commands2'
import { telemetry } from '../shared/telemetry/telemetry'
import { Result } from '../shared/telemetry/telemetry'

const localize = nls.loadMessageBundle()

const commandMap = new Map<[command: string, errorMessage: string], (...args: any) => Promise<any>>()

const createServiceFailed = localize('aws.apprunner.createService.failed', 'Failed to create App Runner service')
const createServiceEcrFailed = localize(
    'aws.apprunner.createServiceFromEcr.failed',
    'Failed to create App Runner service from ECR'
)
const pauseServiceFailed = localize('aws.apprunner.pauseService.failed', 'Failed to pause App Runner service')
const resumeServiceFailed = localize('aws.apprunner.resumeService.failed', 'Failed to resume App Runner service')
const copyServiceUrlFailed = localize('aws.apprunner.copyServiceUrl.failed', 'Failed to copy App Runner service URL')
const openServiceFailed = localize('aws.apprunner.open.failed', 'Failed to open App Runner service')
const deployServiceFailed = localize(
    'aws.apprunner.startDeployment.failed',
    'Failed to start deployment of App Runner service'
)
const deleteServiceFailed = localize('aws.apprunner.deleteService.failed', 'Failed to delete App Runner service')

const copyUrl = async (node: AppRunnerServiceNode) => {
    await copyToClipboard(node.url, 'URL')
    telemetry.apprunner_copyServiceUrl.emit({ passive: false })
}
const openUrl = async (node: AppRunnerServiceNode) => {
    await vscode.env.openExternal(vscode.Uri.parse(node.url))
    telemetry.apprunner_openServiceUrl.emit({ passive: false })
}

const resumeService = async (node: AppRunnerServiceNode) => {
    let telemetryResult: Result = 'Failed'
    try {
        await node.resume()
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.apprunner_resumeService.emit({ result: telemetryResult, passive: false })
    }
}

const deployService = async (node: AppRunnerServiceNode) => {
    let telemetryResult: Result = 'Failed'
    try {
        await node.deploy()
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.apprunner_startDeployment.emit({ result: telemetryResult, passive: false })
    }
}

commandMap.set(['aws.apprunner.createService', createServiceFailed], createAppRunnerService)
commandMap.set(['aws.apprunner.createServiceFromEcr', createServiceEcrFailed], createFromEcr)
commandMap.set(['aws.apprunner.pauseService', pauseServiceFailed], pauseService)
commandMap.set(['aws.apprunner.resumeService', resumeServiceFailed], resumeService)
commandMap.set(['aws.apprunner.copyServiceUrl', copyServiceUrlFailed], copyUrl)
commandMap.set(['aws.apprunner.open', openServiceFailed], openUrl)
commandMap.set(['aws.apprunner.startDeployment', deployServiceFailed], deployService)
commandMap.set(['aws.apprunner.deleteService', deleteServiceFailed], deleteService)

/**
 * Activates App Runner
 */
export async function activate(context: ExtContext): Promise<void> {
    commandMap.forEach((command, tuple) => {
        context.extensionContext.subscriptions.push(
            Commands.register(tuple[0], async (...args: any) => {
                try {
                    await command(...args)
                } catch (err) {
                    getLogger().error(`${tuple[1]}: %s`, err)
                    await showViewLogsMessage(tuple[1])
                }
            })
        )
    })
}
