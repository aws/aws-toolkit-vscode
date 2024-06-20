/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activate as activateCore, deactivate as deactivateCore } from 'aws-core-vscode'
import { awsToolkitApi } from './api'
import { Commands } from 'aws-core-vscode/shared'
import * as vscode from 'vscode'

export async function activate(context: ExtensionContext) {
    await activateCore(context)

    // after toolkit is activated, ask Amazon Q to register toolkit api callbacks
    await Commands.tryExecute('aws.amazonq.refreshConnectionCallback', awsToolkitApi)

    // Update to global state when selecting
    const setWalkthroughToS3 = Commands.declare('aws.toolkit.setWalkthroughToS3', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', 'S3')
        context.globalState.update('walkthroughSelected', 'S3')
    })

    const setWalkthroughToAPI = Commands.declare('aws.toolkit.setWalkthroughToAPI', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', 'API')
        context.globalState.update('walkthroughSelected', 'API')
    })

    const setWalkthroughRuntimeToPython = Commands.declare('aws.toolkit.setWalkthroughRuntimeToPython', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughRuntime', 'Python')
        context.globalState.update('walkthroughRuntime', 'Python')
    })

    const setWalkthroughRuntimeToNode = Commands.declare('aws.toolkit.setWalkthroughRuntimeToNode', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughRuntime', 'Node')
        context.globalState.update('walkthroughRuntime', 'Node')
    })

    const getWalkthrough = Commands.declare('aws.toolkit.getWalkthrough', () => () => {
        const walkthroughSelected = context.globalState.get('walkthroughSelected')
        return walkthroughSelected
    })

    const getRuntime = Commands.declare('aws.toolkit.getRuntime', () => () => {
        const walkthroughRuntime = context.globalState.get('walkthroughRuntime')
        return walkthroughRuntime
    })

    const createWalkthroughProject = Commands.declare('aws.toolkit.createWalkthroughProject', () => () => {
        const walkthroughSelected = context.globalState.get('walkthroughSelected')
        const walkthroughRuntime = context.globalState.get('walkthroughRuntime')

        console.log(walkthroughSelected, walkthroughRuntime)

        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Open',
            canSelectFiles: false,
            canSelectFolders: true,
        }

        vscode.window.showOpenDialog(options).then(fileUri => {
            if (fileUri && fileUri[0]) {
                console.log('Selected file: ' + fileUri[0].fsPath)
                const lambdaUri = vscode.Uri.joinPath(fileUri[0], 'src/handler.py')
                const contents = Buffer.from('tester handler', 'utf8')
                vscode.workspace.fs.writeFile(lambdaUri, contents)
                const templateUri = vscode.Uri.joinPath(fileUri[0], 'template2.yaml')
                const contents2 = Buffer.from('tester template', 'utf8')
                vscode.workspace.fs.writeFile(templateUri, contents2)
                vscode.commands.executeCommand('explorer.openToSide', lambdaUri)
                vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
                vscode.commands.executeCommand('explorer.openToSide', templateUri)
            }
        })
    })

    createWalkthroughProject.register()
    setWalkthroughToS3.register()
    setWalkthroughToAPI.register()
    setWalkthroughRuntimeToNode.register()
    setWalkthroughRuntimeToPython.register()
    getWalkthrough.register()
    getRuntime.register()

    // recover context variables from global state when activate
    const walkthroughSelected = context.globalState.get('walkthroughSelected')
    if (walkthroughSelected != undefined) {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', walkthroughSelected)
    } else {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', 'None')
    }

    vscode.commands.executeCommand('setContext', 'aws.toolkit.availableWalkthroughs', ['S3', 'API'])

    const runtimeSelected = context.globalState.get('walkthroughRuntime')
    if (walkthroughSelected != undefined) {
        vscode.commands.executeCommand('setContext', 'walkthroughRuntime', runtimeSelected)
    } else {
        vscode.commands.executeCommand('setContext', 'walkthroughRuntime', 'None')
    }

    vscode.commands.executeCommand('setContext', 'aws.toolkit.availableWalkthroughRuntime', ['Python', 'Node'])

    return awsToolkitApi
}

export async function deactivate() {
    await deactivateCore()
}
