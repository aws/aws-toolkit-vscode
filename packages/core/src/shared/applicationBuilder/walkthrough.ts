/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { getLogger } from '../logger'

import { Wizard } from '../wizards/wizard'
import { createQuickPick } from '../ui/pickerPrompter'
import { createCommonButtons } from '../ui/buttons'
import * as nls from 'vscode-nls'
import { ToolkitError } from '../errors'
import { SkipPrompter } from '../ui/common/skipPrompter'
import { getWalkthrough } from '../utilities/serverlessLand'
import { createSingleFileDialog } from '../ui/common/openDialog'
import { fs } from '../fs/fs'
import path from 'path'

const localize = nls.loadMessageBundle()
const serverlessLandUrl = 'https://serverlessland.com/'
export const walkthroughContextString = 'aws.toolkit.lambda.walkthroughSelected'
const defaultTemplateName = 'template.yaml'

class RuntimeLocationWizard extends Wizard<{
    runtime: string
    dir: string
    realDir: vscode.Uri
}> {
    public constructor(skipRuntime: boolean, labelValue: string) {
        super()
        const form = this.form
        if (skipRuntime) {
            form.runtime.bindPrompter(() => new SkipPrompter('skipped'))
        } else {
            // step1: choose runtime
            const items = [
                { label: 'Python', data: 'python' },
                { label: 'Node JS', data: 'node' },
                { label: 'Java', data: 'java' },
                { label: 'Dot Net', data: 'dotnet' },
            ]
            form.runtime.bindPrompter(() => {
                return createQuickPick(items, {
                    title: localize('AWS.toolkit.lambda.walkthroughSelectRuntime', 'Select a runtime'),
                    buttons: createCommonButtons(serverlessLandUrl),
                })
            })
        }

        // step2: choose location for project
        const wsFolders = vscode.workspace.workspaceFolders
        const items2 = [
            {
                label: localize('AWS.toolkit.lambda.walkthroughOpenExplorer', 'Open file explorer'),
                data: 'file-selector',
            },
        ]

        // if at least one open workspace, add all opened workspace as options
        if (wsFolders) {
            for (const wsFolder of wsFolders) {
                items2.push({ label: wsFolder.uri.fsPath, data: wsFolder.uri.fsPath })
            }
        }

        form.dir.bindPrompter(() => {
            return createQuickPick(items2, {
                title: localize('AWS.toolkit.lambda.walkthroughProjectLocation', 'Select a location for project'),
                buttons: createCommonButtons(serverlessLandUrl),
            })
        })

        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: labelValue,
            canSelectFiles: false,
            canSelectFolders: true,
        }
        if (wsFolders) {
            options.defaultUri = wsFolders[0]?.uri
        }

        form.realDir.bindPrompter((state) => createSingleFileDialog(options), {
            showWhen: (state) => state.dir !== undefined && state.dir === 'file-selector',
            setDefault: (state) => (state.dir ? vscode.Uri.parse(state.dir) : undefined),
        })

        // option2:workspce filepath returned
    }
}

/**
 * Takes projectUri and runtime then generate matching project
 * @param walkthroughSelected the selected walkthrough
 * @param projectUri The choosen project uri to generate proejct
 * @param runtime The runtime choosen
 */
async function genWalkthroughProject(
    walkthroughSelected: string,
    projectUri: vscode.Uri,
    runtime: string
): Promise<void> {
    // create project here
    // TODO update with file fetching from serverless land
    if (walkthroughSelected === 'CustomTemplate') {
        // customer already have a project, no need to generate
        return
    }

    // check if template.yaml already exists
    const templateUri = vscode.Uri.joinPath(projectUri, defaultTemplateName)
    if (await fs.exists(templateUri)) {
        // ask if want to overwrite
        const choice = await vscode.window.showInformationMessage(
            localize(
                'AWS.toolkit.lambda.walkthroughCreateProjectPrompt',
                '{0} already exist in the selected directory, overwrite?',
                defaultTemplateName
            ),
            'Yes',
            'No'
        )
        if (choice === 'No') {
            throw new ToolkitError(`${defaultTemplateName} already exist`)
        }
    }

    // if Yes, or template not found, continue to generate
    if (walkthroughSelected === 'Visual') {
        // create an empty template.yaml, open it in appcomposer later
        await fs.writeFile(templateUri, Buffer.from(''))
        return
    }
    // start fetching project
    await getWalkthrough(runtime, walkthroughSelected, projectUri)
}

/**
 * check if the selected project Uri exist in current workspace. If not, add Project folder to Workspace
 * @param projectUri uri for the selected project
 */
async function openProjectInWorkspace(projectUri: vscode.Uri): Promise<void> {
    const templateUri = vscode.Uri.joinPath(projectUri, defaultTemplateName)
    if (!(await fs.exists(templateUri))) {
        // no template is found
        void vscode.window.showErrorMessage(
            localize(
                'AWS.toolkit.lambda.walkthroughSamTemplateNotFound',
                '{0} not found in selected folder {1}',
                defaultTemplateName,
                projectUri.fsPath
            ),
            'OK'
        )
        throw new ToolkitError(`${defaultTemplateName} not found in the selected folder ${projectUri.fsPath}`)
    }

    // Open template file, and appcomposer
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
    await vscode.commands.executeCommand('explorer.openToSide', templateUri)
    await vscode.commands.executeCommand('aws.openInApplicationComposer', templateUri)

    // check if project exist in workspace, if exist, return
    const wsFolder = vscode.workspace.workspaceFolders
    if (wsFolder) {
        for (const folder of wsFolder) {
            getLogger().info(`checking ${projectUri.fsPath} vs ${folder.uri.fsPath}`)
            if (projectUri.fsPath === folder.uri.fsPath) {
                return
            }
            const relative = path.relative(folder.uri.fsPath, projectUri.fsPath)
            if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
                //project dir exist in opened workspace
                return
            }
        }
    }
    getLogger().info(`Project directory ${projectUri.fsPath} doesn't belong to active workspace, adding to workspace`)
    // add project dir to workspace
    vscode.workspace.updateWorkspaceFolders(0, 0, { uri: projectUri })
}

/**
 * Used in Toolkit Appbuilder Walkthrough.
 * 1: Customer select a template
 * 2: Create project / Or don't create if customer choose use my own template
 * 3: Add project to workspace, Open template.yaml, open template.yaml in AppComposer
 */
export async function initWalkthroughProjectCommand() {
    const walkthroughSelected = globals.globalState.get(walkthroughContextString)
    if (!walkthroughSelected || !(typeof walkthroughSelected === 'string')) {
        getLogger().info('exit on no walkthrough selected')
        void vscode.window.showErrorMessage(
            localize('AWS.toolkit.lambda.walkthroughNotSelected', 'Please select a template first')
        )
        return
    }
    let labelValue = 'Create Project'
    if (walkthroughSelected === 'CustomTemplate') {
        labelValue = 'Open existing Project'
    }
    // if these two, skip runtime choice
    const skipRuntimeChoice = walkthroughSelected === 'Visual' || walkthroughSelected === 'CustomTemplate'
    const result = await new RuntimeLocationWizard(skipRuntimeChoice, labelValue).run()
    if (!result) {
        getLogger().info('exit on customer quickpick cancellation')
        return
    }

    if (!result.realDir || !fs.exists(result.realDir)) {
        // exit for non-vaild uri
        getLogger().info('exit on customer fileselector cancellation')
        return
    }

    // generate project
    await genWalkthroughProject(walkthroughSelected, result.realDir, result.runtime)
    // open a workspace if no workspace yet
    await openProjectInWorkspace(result.realDir)
}
