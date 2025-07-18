/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AdmZip from 'adm-zip'
import * as _ from 'lodash'
import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { LaunchConfiguration, getReferencedHandlerPaths } from '../../shared/debug/launchConfiguration'

import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger/logger'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/node/httpResourceFetcher'
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
import { fs } from '../../shared/fs/fs'
import { LambdaFunction } from './uploadLambda'
import globals from '../../shared/extensionGlobals'

// Workspace state key for Lambda function ARN to local path cache
const LAMBDA_ARN_CACHE_KEY = 'aws.lambda.functionArnToLocalPathCache' // eslint-disable-line @typescript-eslint/naming-convention

async function setLambdaArnCache(functionArn: string, localPath: string): Promise<void> {
    try {
        const cache: Record<string, string> = globals.context.workspaceState.get(LAMBDA_ARN_CACHE_KEY, {})
        cache[functionArn] = localPath
        await globals.context.workspaceState.update(LAMBDA_ARN_CACHE_KEY, cache)
        getLogger().debug(`lambda: cached local path for function ARN: ${functionArn} -> ${localPath}`)
    } catch (error) {
        getLogger().error(`lambda: failed to cache local path for function ARN: ${functionArn}`, error)
    }
}

export function getCachedLocalPath(functionArn: string): string | undefined {
    const cache: Record<string, string> = globals.context.workspaceState.get(LAMBDA_ARN_CACHE_KEY, {})
    return cache[functionArn]
}

export async function downloadLambdaCommand(functionNode: LambdaFunctionNode) {
    const result = await runDownloadLambda(functionNode)
    // check if result is Result
    if (result instanceof vscode.Uri) {
        return
    }

    telemetry.lambda_import.emit({
        result,
        runtime: functionNode.configuration.Runtime as Runtime | undefined,
    })
}

export async function runDownloadLambda(
    functionNode: LambdaFunctionNode,
    returnDir: boolean = false
): Promise<Result | vscode.Uri> {
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

    if (await fs.exists(downloadLocation)) {
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

        // customer accepted, we should make sure the target dir is clean
        await fs.delete(downloadLocation, { recursive: true })
    }

    return await downloadLambdaInLocation(
        { name: functionName, region: functionNode.regionCode, configuration: functionNode.configuration },
        downloadLocationName,
        downloadLocation,
        workspaceFolders,
        selectedUri,
        returnDir
    )
}

export async function downloadLambdaInLocation(
    lambda: LambdaFunction,
    downloadLocationName: string,
    downloadLocation: string,
    workspaceFolders?: readonly vscode.WorkspaceFolder[],
    selectedUri?: vscode.Uri,
    returnDir: boolean = false
): Promise<Result | vscode.Uri> {
    const result = await vscode.window.withProgress<Result>(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: localize(
                'AWS.lambda.download.status',
                'Downloading Lambda function {0} into {1}...',
                lambda.name,
                downloadLocationName
            ),
        },
        async (progress) => {
            let lambdaLocation: string

            try {
                await downloadAndUnzipLambda(progress, lambda, downloadLocation)
                // Cache the mapping of function ARN to downloaded location
                if (lambda.configuration?.FunctionArn) {
                    await setLambdaArnCache(lambda.configuration.FunctionArn, downloadLocation)
                }
                lambdaLocation = path.join(downloadLocation, getLambdaDetails(lambda.configuration!).fileName)
                if (!(await fs.exists(lambdaLocation))) {
                    // if file ext is mjs, change to js or vice versa
                    const currentExt = path.extname(lambdaLocation)
                    const alternativeExt = currentExt === '.mjs' ? '.js' : '.mjs'
                    const alternativePath = lambdaLocation.replace(currentExt, alternativeExt)

                    if (await fs.exists(alternativePath)) {
                        lambdaLocation = alternativePath
                    }
                }
            } catch (e) {
                // initial download failed or runtime is unsupported.
                // show error and return a failure
                const err = e as Error
                getLogger().error(err)
                void vscode.window.showErrorMessage(
                    localize(
                        'AWS.lambda.download.downloadError',
                        'Error downloading Lambda function {0}: {1}',
                        lambda.configuration!.FunctionArn!,
                        err.message
                    )
                )

                return 'Failed'
            }

            try {
                await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
                await openLambdaFile(lambdaLocation)
                if (workspaceFolders) {
                    if (
                        workspaceFolders.filter((val) => {
                            return selectedUri === val.uri
                        }).length === 0
                    ) {
                        await addFolderToWorkspace({ uri: selectedUri! }, true)
                    }
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(downloadLocation))!

                    await addLaunchConfigEntry(lambdaLocation, lambda, workspaceFolder)
                }
                return 'Succeeded'
            } catch (e) {
                // failed to open handler file or add launch config.
                // not a failure since the function is downloaded to a workspace directory.
                return 'Succeeded'
            }
        }
    )

    if (returnDir) {
        return vscode.Uri.file(downloadLocation)
    } else {
        return result
    }
}

async function downloadAndUnzipLambda(
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>,
    lambda: LambdaFunction,
    extractLocation: string,
    lambdaClient = new DefaultLambdaClient(lambda.region)
): Promise<void> {
    const functionArn = lambda.configuration!.FunctionArn!
    let tempDir: string | undefined
    try {
        tempDir = await makeTemporaryToolkitFolder()
        const downloadLocation = path.join(tempDir, 'function.zip')

        const response = await lambdaClient.getFunction(functionArn)
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

export async function openLambdaFile(lambdaLocation: string, viewColumn?: vscode.ViewColumn): Promise<void> {
    if (!(await fs.exists(lambdaLocation))) {
        const warning = localize(
            'AWS.lambda.download.fileNotFound',
            'Handler file {0} not found in downloaded function.',
            lambdaLocation
        )
        getLogger().warn(warning)
        void vscode.window.showWarningMessage(warning)
        throw new Error()
    }
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(lambdaLocation))
    await vscode.window.showTextDocument(doc, viewColumn)
}

async function addLaunchConfigEntry(
    lambdaLocation: string,
    lambda: LambdaFunction,
    workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
    const handler = lambda.configuration!.Handler!

    const samDebugConfig = createCodeAwsSamDebugConfig(
        workspaceFolder,
        handler,
        computeLambdaRoot(lambdaLocation, lambda),
        lambda.configuration!.Runtime!
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
function computeLambdaRoot(lambdaLocation: string, lambda: LambdaFunction): string {
    const lambdaDetails = getLambdaDetails(lambda.configuration!)
    const normalizedLocation = pathutils.normalize(lambdaLocation)

    const lambdaIndex = normalizedLocation.indexOf(`/${lambdaDetails.fileName}`)

    return lambdaIndex > -1 ? normalizedLocation.slice(0, lambdaIndex) : path.dirname(normalizedLocation)
}
