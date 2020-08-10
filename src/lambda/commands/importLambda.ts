/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AdmZip from 'adm-zip'
import { Lambda } from 'aws-sdk'
import * as fs from 'fs-extra'
import got from 'got'
import * as _ from 'lodash'
import * as path from 'path'
import { Stream } from 'stream'
import { promisify } from 'util'
import * as vscode from 'vscode'
import { LaunchConfiguration, getReferencedHandlerPaths } from '../../shared/debug/launchConfiguration'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder, fileExists } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import { createCodeAwsSamDebugConfig } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { ExtensionDisposableFiles } from '../../shared/utilities/disposableFiles'
import * as pathutils from '../../shared/utilities/pathUtils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { getFamily, RuntimeFamily } from '../models/samLambdaRuntime'
import { showConfirmationMessage } from '../../s3/util/messages'
import { addWorkspaceFolder } from '../../shared/utilities/workspaceUtils'

const pipeline = promisify(Stream.pipeline)

export async function importLambdaCommand(functionNode: LambdaFunctionNode, window = Window.vscode()) {
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    const labelToWorkspace = new Map(workspaceFolders.map(folder => [`$(root-folder-opened) ${folder.name}`, folder]))
    const otherLocationName = `$(folder-opened) ${localize('AWS.lambda.import.otherLocation', 'Select a folder...')}`

    // TODO: Move to FolderQuickPickItem (would have to modify BrowseFolderQuickPickItem to non-Wizard dependence)?
    const selectedLocation = await vscode.window.showQuickPick([...labelToWorkspace.keys(), otherLocationName], {
        placeHolder: localize('AWS.lambda.import.prompt.placeholder', 'Select the import location'),
    })

    if (!selectedLocation) {
        getLogger().info('ImportLambda cancelled')
        return
    }

    let selectedUri: vscode.Uri
    const isWorkspaceFolder = selectedLocation != otherLocationName
    if (isWorkspaceFolder) {
        selectedUri = labelToWorkspace.get(selectedLocation)!.uri
    } else {
        const selectedDirectory = await window.showOpenDialog({
            openLabel: 'Select',
            canSelectFiles: false,
            canSelectFolders: true,
        })
        if (!selectedDirectory) {
            getLogger().info('ImportLambda cancelled')
            return
        }
        selectedUri = selectedDirectory[0]
        addWorkspaceFolder({ uri: selectedUri })
    }

    const functionName = functionNode.configuration.FunctionName!

    const importLocation = path.join(selectedUri.fsPath, functionName, path.sep)
    const importLocationName = vscode.workspace.asRelativePath(importLocation, true)
    const workspaceFolder = isWorkspaceFolder
        ? labelToWorkspace.get(selectedLocation)!
        : vscode.workspace.getWorkspaceFolder(vscode.Uri.file(importLocation))!

    const directoryExists = await fs.pathExists(importLocation)

    const overwriteWarning = localize(
        'AWS.lambda.import.overwriteWarning',
        '\nA directory named {0} already exists! Importing will overwrite any existing files!\n',
        functionName
    )
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.lambda.import.prompt',
                'This will import {0} into {1}.\n{2}\nAre you sure you want to import the function?',
                functionName,
                importLocationName,
                directoryExists ? overwriteWarning : ''
            ),
            confirm: localize('AWS.lambda.import.import', 'Import'),
            cancel: localize('AWS.generic.cancel', 'Cancel'),
        },
        window
    )

    if (!isConfirmed) {
        getLogger().info('ImportLambda cancelled')
        return
    }

    window.withProgress<void>(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: localize(
                'AWS.lambda.import.status',
                'Importing Lambda function {0} into {1}...',
                functionName,
                importLocationName
            ),
        },
        async progress => {
            const lambdaLocation = path.join(importLocation, getLambdaFileNameFromHandler(functionNode.configuration))
            try {
                await downloadAndUnzipLambda(progress, functionNode, importLocation)
                await openLambdaFile(lambdaLocation)
                await addLaunchConfigEntry(lambdaLocation, functionNode, workspaceFolder)
            } catch (e) {
                // swallow error; all functions handle errors themselves
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
    importLocation: string,
    window = Window.vscode(),
    lambda = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode)
): Promise<void> {
    const functionArn = functionNode.configuration.FunctionArn!
    try {
        const tempFolder = await makeTemporaryToolkitFolder()
        ExtensionDisposableFiles.getInstance().addFolder(tempFolder)
        const downloadLocation = path.join(tempFolder, 'function.zip')

        const response = await lambda.getFunction(functionArn)
        const codeLocation = response.Code?.Location!

        // arbitrary increments since there's no "busy" state for progress bars
        progress.report({ increment: 10 })

        await pipeline(got.stream(codeLocation), fs.createWriteStream(downloadLocation))

        progress.report({ increment: 70 })

        await new Promise(resolve => {
            new AdmZip(downloadLocation).extractAllToAsync(importLocation, true, err => {
                if (err) {
                    throw err
                }
                progress.report({ increment: 10 })
                resolve()
            })
        })
    } catch (e) {
        const err = e as Error
        getLogger().error(err)
        window.showErrorMessage(
            localize(
                'AWS.lambda.import.importError',
                'Error importing Lambda function {0}: {1}',
                functionArn,
                err.message
            )
        )

        throw e
    }
}

export async function openLambdaFile(lambdaLocation: string, window = Window.vscode()): Promise<void> {
    if (!(await fileExists(lambdaLocation))) {
        const warning = localize(
            'AWS.lambda.import.fileNotFound',
            'Handler file {0} not found in imported function.',
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
        path.dirname(lambdaLocation),
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

export function getLambdaFileNameFromHandler(configuration: Lambda.FunctionConfiguration): string {
    let runtimeExtension: string
    switch (getFamily(configuration.Runtime!)) {
        case RuntimeFamily.Python:
            runtimeExtension = 'py'
            break
        case RuntimeFamily.NodeJS:
            runtimeExtension = 'js'
            break
        default:
            throw new Error(`Toolkit does not currently support imports for runtime: ${configuration.Runtime}`)
    }

    const fileName = _(configuration.Handler!)
        .split('.')
        .initial()
        .join('.')

    return `${fileName}.${runtimeExtension}`
}
