/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AdmZip from 'adm-zip'
import * as fs from 'fs-extra'
import * as _ from 'lodash'
import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { LaunchConfiguration, getReferencedHandlerPaths } from '../../shared/debug/launchConfiguration'

import { makeTemporaryToolkitFolder, fileExists, tryRemoveFolder } from '../../shared/filesystemUtilities'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { createCodeAwsSamDebugConfig } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import * as pathutils from '../../shared/utilities/pathUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'
import { promptUserForLocation, WizardContext } from '../../shared/wizards/multiStepWizard'
import { getLambdaDetails } from '../utils'
import { Progress } from 'got/dist/source'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Runtime } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { CancellationError } from '../../shared/utilities/timeoutUtils'

export async function downloadLambdaCommand(functionNode: LambdaFunctionNode) {
    return telemetry.lambda_import.run(() => {
        telemetry.record({ runtime: functionNode.configuration.Runtime as Runtime | undefined })
        return runDownloadLambda(functionNode)
    })
}

async function runDownloadLambda(functionNode: LambdaFunctionNode): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    const functionName = functionNode.configuration.FunctionName!

    if (workspaceFolders.length === 0) {
        const msg = localize(
            'AWS.lambda.download.noWorkspaceFolders',
            'Open a workspace before downloading a Lambda function.'
        )
        throw new ToolkitError(msg, { code: 'NoWorkspace' })
    }
    const selectedUri = await promptUserForLocation(new WizardContext(), { step: 1, totalSteps: 1 })
    if (!selectedUri) {
        throw new CancellationError('user')
    }

    const downloadLocation = path.join(selectedUri.fsPath, functionName, path.sep)
    const downloadLocationName = vscode.workspace.asRelativePath(downloadLocation, true)

    if (await fs.pathExists(downloadLocation)) {
        const isConfirmed = await showConfirmationMessage({
            prompt: localize(
                'AWS.lambda.download.prompt',
                'Downloading {0} into: {1}\nExisting directory will be overwritten: {0}\nProceed with download?',
                functionName,
                downloadLocationName
            ),
            confirm: localize('AWS.lambda.download.download', 'Download'),
            cancel: localizedText.cancel,
        })

        if (!isConfirmed) {
            getLogger().info('DownloadLambda cancelled')
            throw new CancellationError('user')
        }
    }

    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: localize(
                'AWS.lambda.download.status',
                'Downloading Lambda function {0} into {1}...',
                functionName,
                downloadLocationName
            ),
        },
        async progress => {
            let lambdaLocation: string

            try {
                lambdaLocation = path.join(downloadLocation, getLambdaDetails(functionNode.configuration).fileName)
                await downloadAndUnzipLambda(progress, functionNode, downloadLocation)
            } catch (e) {
                throw ToolkitError.chain(
                    e,
                    localize(
                        'AWS.lambda.download.downloadError',
                        'Error downloading Lambda function {0}: {1}',
                        functionNode.configuration.FunctionArn!,
                        (e as Error).message
                    )
                )
            }

            try {
                await openLambdaFile(lambdaLocation)
                if (
                    workspaceFolders.filter(val => {
                        return selectedUri === val.uri
                    }).length === 0
                ) {
                    await addFolderToWorkspace({ uri: selectedUri! }, true)
                }
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(downloadLocation))!

                await addLaunchConfigEntry(lambdaLocation, functionNode, workspaceFolder)
            } catch (e) {
                // failed to open handler file or add launch config.
                // not a failure since the function is downloaded to a workspace directory.
                getLogger().warn('Lambda download succeeded but failed to open the handler: %s', e)
            }
        }
    )
}

async function downloadAndUnzipLambda(
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>,
    functionNode: LambdaFunctionNode,
    extractLocation: string,
    lambda = new DefaultLambdaClient(functionNode.regionCode)
): Promise<void> {
    const functionArn = functionNode.configuration.FunctionArn!
    let tempDir: string | undefined
    try {
        tempDir = await makeTemporaryToolkitFolder()
        const downloadLocation = path.join(tempDir, 'function.zip')

        const response = await lambda.getFunction(functionArn)
        const codeLocation = response.Code!.Location!

        // arbitrary increments since there's no "busy" state for progress bars
        progress.report({ message: 'Starting download' })

        const fetcher = new HttpResourceFetcher(codeLocation, {
            showUrl: false,
            friendlyName: 'Lambda Function .zip file',
        })
        const streams = fetcher.get(downloadLocation)

        let last: number = 0
        streams.requestStream.on('downloadProgress', (p: Progress) => {
            // I think these are bytes...
            const message = p.total ? `Downloading ${p.transferred}/${p.total} bytes` : 'Downloading...'
            const increment = p.total ? ((p.transferred - last) / p.total) * 100 : 0
            last = p.transferred
            progress.report({ message, increment })
        })

        await streams
        progress.report({ message: 'Extracting...' })
        new AdmZip(downloadLocation).extractAllTo(extractLocation, true)
    } finally {
        tryRemoveFolder(tempDir)
    }
}

export async function openLambdaFile(lambdaLocation: string): Promise<void> {
    if (!(await fileExists(lambdaLocation))) {
        const warning = localize(
            'AWS.lambda.download.fileNotFound',
            'Handler file {0} not found in downloaded function.',
            lambdaLocation
        )
        getLogger().warn(warning)
        vscode.window.showWarningMessage(warning)
        throw new Error()
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(lambdaLocation))
    await vscode.window.showTextDocument(doc)
}

async function addLaunchConfigEntry(
    lambdaLocation: string,
    functionNode: LambdaFunctionNode,
    workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
    const handler = functionNode.configuration.Handler!

    const samDebugConfig = createCodeAwsSamDebugConfig(
        workspaceFolder,
        handler,
        computeLambdaRoot(lambdaLocation, functionNode),
        functionNode.configuration.Runtime!
    )

    const launchConfig = new LaunchConfiguration(vscode.Uri.file(lambdaLocation))
    if (
        !getReferencedHandlerPaths(launchConfig).has(
            pathutils.normalize(path.join(path.dirname(lambdaLocation), handler))
        )
    ) {
        await launchConfig.addDebugConfiguration(samDebugConfig)
    }
}

/**
 * Computes the Lambda root.
 * We cannot assume that the Lambda root is the dirname since CodeUri is not a required field (can be merged with handler)
 * @param lambdaLocation Lambda handler file location
 * @param functionNode Function node
 */
function computeLambdaRoot(lambdaLocation: string, functionNode: LambdaFunctionNode): string {
    const lambdaDetails = getLambdaDetails(functionNode.configuration)
    const normalizedLocation = pathutils.normalize(lambdaLocation)

    const lambdaIndex = normalizedLocation.indexOf(`/${lambdaDetails.fileName}`)

    return lambdaIndex > -1 ? normalizedLocation.slice(0, lambdaIndex) : path.dirname(normalizedLocation)
}
