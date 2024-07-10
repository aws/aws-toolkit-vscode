/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activate as activateCore, deactivate as deactivateCore } from 'aws-core-vscode'
import { awsToolkitApi } from './api'
import { Commands } from 'aws-core-vscode/shared'
import { Wizard } from 'aws-core-vscode/shared'
import { createCommonButtons } from 'aws-core-vscode/shared'
import { createQuickPick } from 'aws-core-vscode/shared'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'

const serverlessLandUrl = 'https://serverlessland.com/'

const localize = nls.loadMessageBundle()

export async function activate(context: ExtensionContext) {
    await activateCore(context)

    // after toolkit is activated, ask Amazon Q to register toolkit api callbacks
    await Commands.tryExecute('aws.amazonq.refreshConnectionCallback', awsToolkitApi)

    // Update to global state when selecting
    Commands.register('aws.toolkit.setWalkthroughToS3', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', 'S3')
        context.globalState.update('walkthroughSelected', 'S3')
    })

    Commands.register('aws.toolkit.setWalkthroughToAPI', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', 'API')
        context.globalState.update('walkthroughSelected', 'API')
    })

    Commands.register('aws.toolkit.setWalkthroughRuntimeToPython', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughRuntime', 'Python')
        context.globalState.update('walkthroughRuntime', 'Python')
    })

    Commands.register('aws.toolkit.setWalkthroughRuntimeToNode', () => () => {
        vscode.commands.executeCommand('setContext', 'walkthroughRuntime', 'Node')
        context.globalState.update('walkthroughRuntime', 'Node')
    })

    Commands.register('aws.toolkit.getWalkthrough', () => () => {
        const walkthroughSelected = context.globalState.get('walkthroughSelected')
        return walkthroughSelected
    })

    Commands.register('aws.toolkit.getRuntime', () => () => {
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

                // step1: choose runtime
                const items = [
                    { label: 'Python', data: 'python' },
                    { label: 'Node JS', data: 'node' },
                    { label: 'Java', data: 'java' },
                    { label: 'Dot Net', data: 'dotnet' },
                ]
                form.runtime.bindPrompter(() => {
                    return createQuickPick(items, {
                        title: localize('AWS.toolkit.walkthrough.selectruntime', 'Select a runtime'),
                        buttons: createCommonButtons(serverlessLandUrl),
                    })
                })

                // step2: choose location for project
                const wsFolders = vscode.workspace.workspaceFolders
                const items2 = [
                    {
                        label: localize('AWS.toolkit.walkthrough.openexplorer', 'Open file explorer'),
                        data: 'file-selector',
                    },
                ]

                // if at least one open workspace, add all opened workspace as options
                if (wsFolders) {
                    for (var wsFolder of wsFolders) {
                        items2.push({ label: wsFolder.uri.fsPath, data: wsFolder.uri.fsPath })
                    }
                }

                form.dir.bindPrompter(() => {
                    return createQuickPick(items2, {
                        title: localize('AWS.toolkit.walkthrough.projectlocation', 'Select a location for project'),
                        buttons: createCommonButtons(serverlessLandUrl),
                    })
                })
            }
        })()
        const result = await wizard.run()
        // {foo:'abcddd',bar:1}
        // return if undefined
        console.log(result)
        if (!result) {
            return undefined
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
            return undefined
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
        vscode.commands.executeCommand('vscode.open', templateUri)

        console.log(result)
    })

    Commands.register(`aws.toolkit.walkthrough`, async () => {
        vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'amazonwebservices.aws-toolkit-vscode#lambdaWelcome'
        )
    })

    // recover context variables from global state when activate
    const walkthroughSelected = context.globalState.get('walkthroughSelected')
    if (walkthroughSelected != undefined) {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', walkthroughSelected)
    } else {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', 'None')
    }

    return awsToolkitApi
}

export async function deactivate() {
    await deactivateCore()
}
