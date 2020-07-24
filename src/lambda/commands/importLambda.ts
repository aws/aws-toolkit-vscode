/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import * as AdmZip from 'adm-zip'
import got from 'got'
import { LaunchConfiguration } from '../../shared/debug/launchConfiguration'
import { ext } from '../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { createCodeAwsSamDebugConfig } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { ExtensionDisposableFiles } from '../../shared/utilities/disposableFiles'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { promisify } from 'util'
import { Stream } from 'stream'
import * as fs from 'fs-extra'
import * as path from 'path'
import { getLogger } from '../../shared/logger'
import { Window } from '../../shared/vscode/window'
import { Commands } from '../../shared/vscode/commands'
import * as _ from 'lodash'

const pipeline = promisify(Stream.pipeline)

export async function importLambdaCommand(
    functionNode: LambdaFunctionNode,
    lambda = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode),
    commands = Commands.vscode(),
    window = Window.vscode()
) {
    const workspaceFolders = vscode.workspace.workspaceFolders || []
    const labelToWorkspace = new Map(workspaceFolders.map(folder => [`$(root-folder-opened) ${folder.name}`, folder]))
    const otherLocationName = '$(folder-opened) Select a folder...'

    const selectedLocation = await vscode.window.showQuickPick([...labelToWorkspace.keys(), otherLocationName], {
        placeHolder: 'Select the import location',
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

    const overwriteWarning = `\nA directory named ${functionName} already exists! Importing will overwrite any existing files!\n`
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: `This will import ${functionName} into ${importLocationName}.\n${
                directoryExists ? overwriteWarning : ''
            }\nAre you sure you want to import the function?`,
            confirm: 'Import',
            cancel: 'Cancel',
        },
        window
    )

    if (!isConfirmed) {
        getLogger().info('ImportLambda cancelled')
        return
    }

    const tempFolder = await makeTemporaryToolkitFolder()
    ExtensionDisposableFiles.getInstance().addFolder(tempFolder)
    const downloadLocation = path.join(tempFolder, 'function.zip')

    const functionArn = functionNode.configuration.FunctionArn!
    const response = await lambda.getFunction(functionArn)
    const codeLocation = response.Code?.Location!

    await pipeline(got.stream(codeLocation), fs.createWriteStream(downloadLocation))

    new AdmZip(downloadLocation).extractAllTo(importLocation, true)

    if (!isWorkspaceFolder) {
        await commands.execute('vscode.openFolder', vscode.Uri.file(importLocation), true)
    }

    const lambdaLocation = path.join(importLocation, lambdaFileName(functionNode.configuration))

    const workspaceFolder = isWorkspaceFolder
        ? labelToWorkspace.get(selectedLocation)!
        : vscode.workspace.getWorkspaceFolder(vscode.Uri.file(importLocation))!

    const samDebugConfig = createCodeAwsSamDebugConfig(
        workspaceFolder,
        functionNode.configuration.Handler!,
        path.dirname(lambdaLocation),
        functionNode.configuration.Runtime!
    )

    const launchConfig = new LaunchConfiguration(vscode.Uri.file(lambdaLocation))
    await launchConfig.addDebugConfiguration(samDebugConfig)

    await commands.execute('vscode.open', vscode.Uri.file(lambdaLocation))
}

function lambdaFileName(configuration: Lambda.FunctionConfiguration): string {
    const runtimeExtension = configuration.Runtime?.startsWith('python') ? 'py' : 'js'

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
