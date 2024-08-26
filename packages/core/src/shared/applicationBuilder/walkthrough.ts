/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { getLogger } from '../logger'

import { Wizard } from '../wizards/wizard'
import { createQuickPick } from '../ui/pickerPrompter'
import { createCommonButtons } from '../ui/buttons'
import * as nls from 'vscode-nls'
import { ToolkitError } from '../errors'
import { SkipPrompter } from '../ui/common/skipPrompter'
import { createSingleFileDialog } from '../ui/common/openDialog'
import { fs } from '../fs/fs'
import path from 'path'
import { telemetry } from '../telemetry'
import { ExtContext } from '../extensions'

import { minSamCliVersionForAppBuilderSupport } from '../sam/cli/samCliValidator'
import { getSamCliVersion } from '../sam/cli/samCliContext'
import { openUrl } from '../utilities/vsCodeUtils'
import { getOrInstallCli, awsClis, AwsClis } from '../utilities/cliUtils'
import { getPattern } from '../utilities/downloadPatterns'

const localize = nls.loadMessageBundle()
const serverlessLandUrl = 'https://serverlessland.com/'
export const walkthroughContextString = 'aws.toolkit.lambda.walkthroughSelected'
const defaultTemplateName = 'template.yaml'
const serverlessLandOwner = 'aws-samples'
const serverlessLandRepo = 'serverless-patterns'

type WalkthroughOptions = 'CustomTemplate' | 'Visual' | 'S3' | 'API'
type TutorialRuntimeOptions = 'python' | 'node' | 'java' | 'dotnet' | 'skipped'

interface IServerlessLandProject {
    asset: string
    handler?: string
}

const appMap = new Map<string, IServerlessLandProject>([
    ['APIdotnet', { asset: 'apigw-rest-api-lambda-dotnet.zip', handler: 'src/HelloWorld/Function.cs' }],
    ['APInode', { asset: 'apigw-rest-api-lambda-node.zip', handler: 'hello_world/app.mjs' }],
    ['APIpython', { asset: 'apigw-rest-api-lambda-python.zip', handler: 'hello_world/app.py' }],
    [
        'APIjava',
        {
            asset: 'apigw-rest-api-lambda-java.zip',
            handler: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        },
    ],
    ['S3dotnet', { asset: 's3-lambda-dotnet.zip', handler: 'ImageResize/Function.cs' }],
    ['S3node', { asset: 's3-lambda.zip', handler: 'src/app.js' }],
    ['S3python', { asset: 's3-lambda-resizing-python.zip', handler: 'src/app.py' }],
    [
        'S3java',
        {
            asset: 's3-lambda-resizing-java.zip',
            handler: 'ResizerFunction/src/main/java/resizer/App.java',
        },
    ],
])

class RuntimeLocationWizard extends Wizard<{
    runtime: TutorialRuntimeOptions
    dir: string
    realDir: vscode.Uri
}> {
    public constructor(skipRuntime: boolean, labelValue: string) {
        super()
        const form = this.form
        if (skipRuntime) {
            form.runtime.bindPrompter(() => new SkipPrompter('skipped' as TutorialRuntimeOptions))
        } else {
            // step1: choose runtime
            const items: { label: string; data: TutorialRuntimeOptions }[] = [
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

export async function getTutorial(
    runtime: TutorialRuntimeOptions,
    project: WalkthroughOptions,
    outputDir: vscode.Uri,
    source?: string
): Promise<void> {
    const appSelected = appMap.get(project + runtime)
    telemetry.record({ action: project + runtime, source: source ?? 'AppBuilderWalkthrough' })
    if (!appSelected) {
        throw new ToolkitError(`Tried to get template '${project}+${runtime}', but it hasn't been registered.`)
    }

    try {
        await getPattern(serverlessLandOwner, serverlessLandRepo, appSelected.asset, outputDir, true)
    } catch (error) {
        throw new ToolkitError(`Error occurred while fetching the pattern from serverlessland: ${error}`)
    }
}

/**
 * Takes projectUri and runtime then generate matching project
 * @param walkthroughSelected the selected walkthrough
 * @param projectUri The choosen project uri to generate proejct
 * @param runtime The runtime choosen
 */
async function genWalkthroughProject(
    walkthroughSelected: WalkthroughOptions,
    projectUri: vscode.Uri,
    runtime: TutorialRuntimeOptions | undefined
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
    if (runtime && runtime !== 'skipped') {
        await getTutorial(runtime, walkthroughSelected, projectUri, 'AppBuilderWalkthrough')
    }
}

/**
 * check if the selected project Uri exist in current workspace. If not, add Project folder to Workspace
 * @param projectUri uri for the selected project
 */
async function openProjectInWorkspace(projectUri: vscode.Uri): Promise<void> {
    let templateUri: vscode.Uri | undefined = vscode.Uri.joinPath(projectUri, defaultTemplateName)
    if (!(await fs.exists(templateUri))) {
        // no template.yaml, trying yml
        templateUri = vscode.Uri.joinPath(projectUri, 'template.yml')
        if (!(await fs.exists(templateUri))) {
            templateUri = undefined
        }
    }

    // if no template, just add dir to workspace
    if (templateUri) {
        // Open template file, and appcomposer
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        await vscode.commands.executeCommand('explorer.openToSide', templateUri)
        await vscode.commands.executeCommand('aws.openInApplicationComposer', templateUri)
    }

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
    const walkthroughSelected = globals.globalState.get<WalkthroughOptions>(walkthroughContextString)
    let runtimeSelected: TutorialRuntimeOptions | undefined = undefined
    try {
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
            getLogger().info('User canceled the runtime selection process via quickpick')
            return
        }

        if (!result.realDir || !fs.exists(result.realDir)) {
            // exit for non-vaild uri
            getLogger().info('exit on customer fileselector cancellation')
            return
        }

        runtimeSelected = result.runtime

        // generate project
        await genWalkthroughProject(walkthroughSelected, result.realDir, runtimeSelected)
        // open a workspace if no workspace yet
        await openProjectInWorkspace(result.realDir)
    } finally {
        telemetry.record({ action: `${walkthroughSelected}:${runtimeSelected}`, source: 'AppBuilderWalkthrough' })
    }
}

export async function getOrUpdateOrInstallSAMCli(source: string, context: ExtContext) {
    try {
        const samCliVersion = await getSamCliVersion(context.samCliContext())
        // find sam
        if (semver.lt(samCliVersion, minSamCliVersionForAppBuilderSupport)) {
            // sam found but version too low
            const updateInstruction = localize(
                'AWS.toolkit.updateSAMInstruction',
                'View AWS SAM CLI update instructions'
            )
            const selection = await vscode.window.showInformationMessage(
                localize(
                    'AWS.toolkit.samOutdatedPrompt',
                    'AWS SAM CLI version {0} or greater is required ({1} currently installed).',
                    minSamCliVersionForAppBuilderSupport,
                    samCliVersion
                ),
                updateInstruction
            )
            if (selection === updateInstruction) {
                void openUrl(vscode.Uri.parse(awsClis['sam-cli'].manualInstallLink))
            }
        } else {
            // sam normal version
            await getOrInstallCli('sam-cli', true, true)
        }
    } catch {
        // sam is not found, error handled inside
        await getOrInstallCli('sam-cli', true, true)
    } finally {
        telemetry.record({ source: source, toolId: 'sam-cli' })
    }
}

/**
 * wraps getOrinstallCli and send telemetry
 * @param toolId to install/check
 * @param source to be added in telemetry
 * @param context the extension context
 */
export async function getOrInstallCliWrapper(toolId: AwsClis, source: string, context: ExtContext) {
    await telemetry.appBuilder_installTool.run(async () => {
        if (toolId === 'sam-cli') {
            await getOrUpdateOrInstallSAMCli(source, context)
            return
        }
        try {
            await getOrInstallCli(toolId, true, true)
        } finally {
            telemetry.record({ source: source, toolId: toolId })
        }
    })
}
