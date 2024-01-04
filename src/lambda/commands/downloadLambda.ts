/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AdmZip from 'adm-zip'
import * as fs from 'fs-extra'
import * as _ from 'lodash'
import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { LaunchConfiguration, getReferencedHandlerPaths } from '../../shared/debug/launchConfiguration'

import { makeTemporaryToolkitFolder, fileOrFolderExists, tryRemoveFolder } from '../../shared/filesystemUtilities'
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
import { Result, Runtime } from '../../shared/telemetry/telemetry'

export async function downloadLambdaCommand(functionNode: LambdaFunctionNode) {
    const result = await runDownloadLambda(functionNode)

    telemetry.lambda_import.emit({
        result,
        runtime: functionNode.configuration.Runtime as Runtime | undefined,
    })
}

async function runDownloadLambda(functionNode: LambdaFunctionNode): Promise<Result> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    const functionName = functionNode.configuration.FunctionName!

    if (workspaceFolders.length === 0) {
        void vscode.window.showErrorMessage(
            localize(
                'AWS.lambda.download.noWorkspaceFolders',
                'Open a workspace and add a folder to it before downloading a Lambda function.'
            )
        )
        return 'Cancelled'
    }
    const selectedUri = await promptUserForLocation(new WizardContext(), { step: 1, totalSteps: 1 })
    if (!selectedUri) {
        return 'Cancelled'
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
            return 'Cancelled'
        }
    }

    return await vscode.window.withProgress<Result>(
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
                // initial download failed or runtime is unsupported.
                // show error and return a failure
                const err = e as Error
                getLogger().error(err)
                void vscode.window.showErrorMessage(
                    localize(
                        'AWS.lambda.download.downloadError',
                        'Error downloading Lambda function {0}: {1}',
                        functionNode.configuration.FunctionArn!,
                        err.message
                    )
                )

                return 'Failed'
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

                return 'Succeeded'
            } catch (e) {
                // failed to open handler file or add launch config.
                // not a failure since the function is downloaded to a workspace directory.
                return 'Succeeded'
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
        await tryRemoveFolder(tempDir)
    }
}

export async function openLambdaFile(lambdaLocation: string): Promise<void> {
    if (!(await fileOrFolderExists(lambdaLocation))) {
        const warning = localize(
            'AWS.lambda.download.fileNotFound',
            'Handler file {0} not found in downloaded function.',
            lambdaLocation
        )
        getLogger().warn(warning)
        void vscode.window.showWarningMessage(warning)
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
    const refPaths = await getReferencedHandlerPaths(launchConfig)
    if (!refPaths.has(pathutils.normalize(path.join(path.dirname(lambdaLocation), handler)))) {
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
