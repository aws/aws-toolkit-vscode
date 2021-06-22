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
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder, fileExists, tryRemoveFolder } from '../../shared/filesystemUtilities'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { createCodeAwsSamDebugConfig } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import * as telemetry from '../../shared/telemetry/telemetry'
import * as pathutils from '../../shared/utilities/pathUtils'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'
import { Window } from '../../shared/vscode/window'
import { promptUserForLocation, WizardContext } from '../../shared/wizards/multiStepWizard'
import { getLambdaDetails } from '../utils'

export async function downloadLambdaCommand(functionNode: LambdaFunctionNode) {
    const result = await runDownloadLambda(functionNode)

    telemetry.recordLambdaImport({
        result,
        runtime: functionNode.configuration.Runtime as telemetry.Runtime | undefined,
    })
}

async function runDownloadLambda(functionNode: LambdaFunctionNode, window = Window.vscode()): Promise<telemetry.Result> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    const functionName = functionNode.configuration.FunctionName!

    if (workspaceFolders.length === 0) {
        window.showErrorMessage(
            localize('AWS.lambda.download.noWorkspaceFolders', 'Open a workspace before downloading a Lambda function.')
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
        const isConfirmed = await showConfirmationMessage(
            {
                prompt: localize(
                    'AWS.lambda.download.prompt',
                    'Downloading {0} into: {1}\nExisting directory will be overwritten: {0}\nProceed with download?',
                    functionName,
                    downloadLocationName
                ),
                confirm: localize('AWS.lambda.download.download', 'Download'),
                cancel: localizedText.cancel,
            },
            window
        )

        if (!isConfirmed) {
            getLogger().info('DownloadLambda cancelled')
            return 'Cancelled'
        }
    }

    return await window.withProgress<telemetry.Result>(
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
                window.showErrorMessage(
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
    downloadLocation: string,
    window = Window.vscode(),
    lambda = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode)
): Promise<void> {
    const functionArn = functionNode.configuration.FunctionArn!
    let tempDir: string | undefined
    try {
        tempDir = await makeTemporaryToolkitFolder()
        const downloadLocation = path.join(tempDir, 'function.zip')

        const response = await lambda.getFunction(functionArn)
        const codeLocation = response.Code!.Location!

        // arbitrary increments since there's no "busy" state for progress bars
        progress.report({ increment: 10 })

        const fetcher = new HttpResourceFetcher(codeLocation, {
            pipeLocation: downloadLocation,
            showUrl: false,
            friendlyName: 'Lambda Function .zip file',
        })
        await fetcher.get()

        progress.report({ increment: 70 })

        // HACK: `request` (currently implemented by the `fetcher.get()` call) doesn't necessarily close the pipe before returning.
        // Brings up issues in less performant systems.
        // keep attempting the unzip until the zip is fully built or fail after 5 seconds
        let zipErr: Error | undefined
        const val = await waitUntil(async () => {
            return await new Promise<boolean | undefined>(resolve => {
                try {
                    new AdmZip(downloadLocation).extractAllToAsync(downloadLocation, true, err => {
                        if (err) {
                            // err unzipping
                            zipErr = err
                            resolve(false)
                        } else {
                            progress.report({ increment: 10 })
                            resolve(true)
                        }
                    })
                } catch (err) {
                    // err loading zip into AdmZip, prior to attempting an unzip
                    zipErr = err
                    resolve(false)
                }
            })
        }, { timeout: 10000, interval: 1000, truthy: true })

        if (!val) {
            throw zipErr
        }
    } finally {
        tryRemoveFolder(tempDir)
    }
}

export async function openLambdaFile(lambdaLocation: string, window = Window.vscode()): Promise<void> {
    if (!(await fileExists(lambdaLocation))) {
        const warning = localize(
            'AWS.lambda.download.fileNotFound',
            'Handler file {0} not found in downloaded function.',
            lambdaLocation
        )
        getLogger().warn(warning)
        window.showWarningMessage(warning)
        throw new Error()
    }
    // TODO: move this into Window.vscode()?
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

    return lambdaIndex > -1 ? normalizedLocation.substr(0, lambdaIndex) : path.dirname(normalizedLocation)
}
