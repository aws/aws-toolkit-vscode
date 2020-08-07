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
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import { createCodeAwsSamDebugConfig } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { ExtensionDisposableFiles } from '../../shared/utilities/disposableFiles'
import * as pathutils from '../../shared/utilities/pathUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { getFamily, RuntimeFamily } from '../models/samLambdaRuntime'
import { localize } from '../../shared/utilities/vsCodeUtils'

const pipeline = promisify(Stream.pipeline)

export async function importLambdaCommand(
    functionNode: LambdaFunctionNode,
    lambda = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode),
    commands = Commands.vscode(),
    window = Window.vscode()
) {
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    const labelToWorkspace = new Map(workspaceFolders.map(folder => [`$(root-folder-opened) ${folder.name}`, folder]))
    const otherLocationName = `$(folder-opened) ${localize('AWS.lambda.import.otherLocation', 'Select a folder...')}`

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
    }

    const functionName = functionNode.configuration.FunctionName!

    const importLocation = path.join(selectedUri.fsPath, functionName, '/')
    const importLocationName = vscode.workspace.asRelativePath(importLocation, true)

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

    vscode.window.withProgress<void>(
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
            const tempFolder = await makeTemporaryToolkitFolder()
            ExtensionDisposableFiles.getInstance().addFolder(tempFolder)
            const downloadLocation = path.join(tempFolder, 'function.zip')

            const functionArn = functionNode.configuration.FunctionArn!
            const handler = functionNode.configuration.Handler!
            const response = await lambda.getFunction(functionArn)
            const codeLocation = response.Code?.Location!

            progress.report({ increment: 10 })

            await pipeline(got.stream(codeLocation), fs.createWriteStream(downloadLocation))

            progress.report({ increment: 70 })

            new AdmZip(downloadLocation).extractAllTo(importLocation, true)

            progress.report({ increment: 10 })

            if (!isWorkspaceFolder) {
                await commands.execute('vscode.openFolder', vscode.Uri.file(importLocation), true)
            }

            const lambdaLocation = path.join(importLocation, lambdaFileName(functionNode.configuration))

            const workspaceFolder = isWorkspaceFolder
                ? labelToWorkspace.get(selectedLocation)!
                : vscode.workspace.getWorkspaceFolder(vscode.Uri.file(importLocation))!

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
            await commands.execute('vscode.open', vscode.Uri.file(lambdaLocation))
        }
    )
}

function lambdaFileName(configuration: Lambda.FunctionConfiguration): string {
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

/**
 * Shows a modal confirmation (warning) message with buttons to confirm or cancel.
 *
 * @param prompt the message to show.
 * @param confirm the confirmation button text.
 * @param cancel the cancel button text.
 * @param window the window.
 */
export async function showConfirmationMessage(
    { prompt, confirm, cancel }: { prompt: string; confirm: string; cancel: string },
    window: Window
): Promise<boolean> {
    const confirmItem: vscode.MessageItem = { title: confirm }
    const cancelItem: vscode.MessageItem = { title: cancel, isCloseAffordance: true }

    const selection = await window.showWarningMessage(prompt, { modal: true }, confirmItem, cancelItem)
    return selection === confirmItem
}
