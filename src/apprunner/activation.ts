/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../shared/telemetry/telemetry'
import * as nls from 'vscode-nls'
import { showErrorWithLogs } from '../shared/utilities/messages'
import { AppRunnerServiceNode } from './explorer/apprunnerServiceNode'
import { getLogger } from '../shared/logger/logger'
import { createAppRunnerService } from './commands/createService'
import { pauseService } from './commands/pauseService'
import { deleteService } from './commands/deleteService'
import { createFromEcr } from './commands/createServiceFromEcr'
import { ExtContext } from '../shared/extensions'

const localize = nls.loadMessageBundle()

const commandMap = new Map<[command: string, errorMessage: string], (...args: any) => Promise<any>>()

const CREATE_SERVICE_FAILED = localize('aws.apprunner.createService.failed', 'Failed to create App Runner service')
const CREATE_SERVICE_ECR_FAILED = localize(
    'aws.apprunner.createServiceFromEcr.failed',
    'Failed to create App Runner service from ECR'
)
const PAUSE_SERVICE_FAILED = localize('aws.apprunner.pauseService.failed', 'Failed to pause App Runner service')
const RESUME_SERVICE_FAILED = localize('aws.apprunner.resumeService.failed', 'Failed to resume App Runner service')
const COPY_SERVICE_URL_FAILED = localize('aws.apprunner.copyServiceUrl.failed', 'Failed to copy App Runner service URL')
const OPEN_SERVICE_FAILED = localize('aws.apprunner.open.failed', 'Failed to open App Runner service')
const DEPLOY_SERVICE_FAILED = localize(
    'aws.apprunner.startDeployment.failed',
    'Failed to start deployment of App Runner service'
)
const DELETE_SERVICE_FAILED = localize('aws.apprunner.deleteService.failed', 'Failed to delete App Runner service')

const copyUrl = async (node: AppRunnerServiceNode) => {
    await vscode.env.clipboard.writeText(node.url)
    telemetry.recordApprunnerCopyServiceUrl({ passive: false })
}
const openUrl = async (node: AppRunnerServiceNode) => {
    await vscode.env.openExternal(vscode.Uri.parse(node.url))
    telemetry.recordApprunnerOpenServiceUrl({ passive: false })
}

const resumeService = async (node: AppRunnerServiceNode) => {
    let telemetryResult: telemetry.Result = 'Failed'
    try {
        await node.resume()
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.recordApprunnerResumeService({ result: telemetryResult, passive: false })
    }
}

const deployService = async (node: AppRunnerServiceNode) => {
    let telemetryResult: telemetry.Result = 'Failed'
    try {
        await node.deploy()
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.recordApprunnerStartDeployment({ result: telemetryResult, passive: false })
    }
}

commandMap.set(['aws.apprunner.createService', CREATE_SERVICE_FAILED], createAppRunnerService)
commandMap.set(['aws.apprunner.createServiceFromEcr', CREATE_SERVICE_ECR_FAILED], createFromEcr)
commandMap.set(['aws.apprunner.pauseService', PAUSE_SERVICE_FAILED], pauseService)
commandMap.set(['aws.apprunner.resumeService', RESUME_SERVICE_FAILED], resumeService)
commandMap.set(['aws.apprunner.copyServiceUrl', COPY_SERVICE_URL_FAILED], copyUrl)
commandMap.set(['aws.apprunner.open', OPEN_SERVICE_FAILED], openUrl)
commandMap.set(['aws.apprunner.startDeployment', DEPLOY_SERVICE_FAILED], deployService)
commandMap.set(['aws.apprunner.deleteService', DELETE_SERVICE_FAILED], deleteService)

/**
 * Activates App Runner
 */
export async function activate(context: ExtContext): Promise<void> {
    commandMap.forEach((command, tuple) => {
        context.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(tuple[0], async (...args: any) => {
                try {
                    await command(...args)
                } catch (err) {
                    getLogger().error(`${tuple[1]}: %O`, err)
                    showErrorWithLogs(tuple[1])
                }
            })
        )
    })
}
