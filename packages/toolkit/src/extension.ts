/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activate as activateCore, deactivate as deactivateCore } from 'aws-core-vscode'
import { awsToolkitApi } from './api'
import { Commands } from 'aws-core-vscode/shared'
import { Wizard } from 'aws-core-vscode/shared'
import { createQuickPick } from 'aws-core-vscode/shared'
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

    Commands.register('aws.toolkit.getRuntimeQP', async () => {
        const wizard = new (class ExampleWizard extends Wizard<{
            runtime: string
            dir: string
        }> {
            public constructor() {
                super()
                const form = this.form
                // Note that steps should only be assigned in the constructor by convention
                // This first step will always be shown as we did not specify any dependencies
                // form.foo.bindPrompter(() => createInputBox({ title: 'Enter a string' }))
                // const items = [
                //     { label: 'Python', data: 'python' },
                //     { label: 'Node JS', data: 'node' },
                //     { label: 'Java', data: 'java' },
                //     { label: 'Dot Net', data: 'dotnet' }

                // ]
                // this.form.bar.bindPrompter(({foo}:{foo:any}) => {
                //     if (foo.length <= 5) {
                //         return new SkipPrompter('')
                //     }
                //     return createQuickPick(items, { title: `Select a runtime` })
                // })
                // Our second step is only shown if the length of `foo` is greater than 5
                // Because of this, we typed `bar` as potentially being `undefined` in `ExampleState`

                // step1: choose runtime
                const items = [
                    { label: 'Python', data: 'python' },
                    { label: 'Node JS', data: 'node' },
                    { label: 'Java', data: 'java' },
                    { label: 'Dot Net', data: 'dotnet' },
                ]
                form.runtime.bindPrompter(() => {
                    // if (context.globalState.get('walkthroughSelected')== undefined) {
                    //     vscode.window.showErrorMessage('Please select a template first');
                    //     return new SkipPrompter('')
                    // }
                    return createQuickPick(items, { title: `Select a runtime` })
                })

                // step2: choose location for project
                const wsFolders = vscode.workspace.workspaceFolders
                const items2 = [{ label: 'Open file explorer', data: 'file-selector' }]

                // at least one open workspace
                if (wsFolders) {
                    for (var wsFolder of wsFolders) {
                        items2.push({ label: wsFolder.uri.fsPath, data: wsFolder.uri.fsPath })
                    }
                }

                form.dir.bindPrompter(() => {
                    return createQuickPick(items2, { title: `Select a location for project` })
                })
            }
        })()
        const result = await wizard.run()
        // {foo:'abcddd',bar:1}
        // return if undefined
        console.log(result)
        if (!result) {
            return
        }
        // select folder and create project here
        const getProjectUri = () => {
            const wsFolders = vscode.workspace.workspaceFolders
            if (result.dir == 'file-selector') {
                let options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Create Project',
                    canSelectFiles: false,
                    canSelectFolders: true,
                }
                if (wsFolders) {
                    options.defaultUri = wsFolders[0]?.uri
                }

                return vscode.window.showOpenDialog(options).then(fileUri => {
                    if (fileUri && fileUri[0]) {
                        console.log('file choose')
                        return Promise.resolve(fileUri[0])
                    }
                    return Promise.resolve(undefined)
                })
            }
            // option2:workspce filepath returned
            return vscode.Uri.parse(result.dir)
        }

        let projectUri = await getProjectUri()
        if (!projectUri) {
            // exit for non-vaild uri
            console.log('exit')
            return
        }
        // create project here
        // TODO update with file fetching from serverless land
        const walkthroughSelected = context.globalState.get('walkthroughSelected')

        const lambdaUri = vscode.Uri.joinPath(projectUri, 'src/handler.py')
        const contents = Buffer.from(`tester handler for ${walkthroughSelected}:${result.runtime}`, 'utf8')
        vscode.workspace.fs.writeFile(lambdaUri, contents)
        const templateUri = vscode.Uri.joinPath(projectUri, 'template2.yaml')
        const contents2 = Buffer.from(`tester template ${walkthroughSelected}:${result.runtime}`, 'utf8')
        vscode.workspace.fs.writeFile(templateUri, contents2)
        vscode.commands.executeCommand('explorer.openToSide', lambdaUri)
        vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        vscode.commands.executeCommand('explorer.openToSide', templateUri)

        console.log(result)
    })

    Commands.register(`aws.toolkit.walkthrough`, async () => {
        vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'amazonwebservices.aws-toolkit-vscode#lambdaWelcome'
        )
    })

    const createWalkthroughProject = Commands.declare('aws.toolkit.createWalkthroughProject', () => () => {
        const walkthroughSelected = context.globalState.get('walkthroughSelected')
        const walkthroughRuntime = context.globalState.get('walkthroughRuntime')

        console.log(walkthroughSelected, walkthroughRuntime)

        let options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Open',
            canSelectFiles: false,
            canSelectFolders: true,
        }

        // open file selector in current workspace
        const wsFolders = vscode.workspace.workspaceFolders
        if (wsFolders) {
            options.defaultUri = wsFolders[0]?.uri
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
    if (runtimeSelected != undefined) {
        vscode.commands.executeCommand('setContext', 'walkthroughRuntime', runtimeSelected)
    } else {
        vscode.commands.executeCommand('aws.toolkit.setWalkthroughToAPI')
    }

    vscode.commands.executeCommand('setContext', 'aws.toolkit.availableWalkthroughRuntime', [
        'Python',
        'Node',
        'Java',
        'Dotnet',
    ])

    return awsToolkitApi
}

export async function deactivate() {
    await deactivateCore()
}
