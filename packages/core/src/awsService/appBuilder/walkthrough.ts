/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'

import { Wizard } from '../../shared/wizards/wizard'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import * as nls from 'vscode-nls'
import { ToolkitError } from '../../shared/errors'
import { createSingleFileDialog } from '../../shared/ui/common/openDialog'
import { fs } from '../../shared/fs/fs'
import path from 'path'
import { telemetry } from '../../shared/telemetry/telemetry'

import { minSamCliVersionForAppBuilderSupport } from '../../shared/sam/cli/samCliValidator'
import { SamCliInfoInvocation } from '../../shared/sam/cli/samCliInfo'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { getOrInstallCli, awsClis, AwsClis } from '../../shared/utilities/cliUtils'
import { getPattern } from '../../shared/utilities/downloadPatterns'
import { addFolderToWorkspace } from '../../shared/utilities/workspaceUtils'

const localize = nls.loadMessageBundle()
const serverlessLandUrl = 'https://serverlessland.com/'
export const walkthroughContextString = 'aws.toolkit.lambda.walkthroughSelected'
export const templateToOpenAppComposer = 'aws.toolkit.appComposer.templateToOpenOnStart'
const defaultTemplateName = 'template.yaml'
const serverlessLandOwner = 'aws-samples'
const serverlessLandRepo = 'serverless-patterns'

type WalkthroughOptions = 'CustomTemplate' | 'Visual' | 'S3' | 'API'
type TutorialRuntimeOptions = 'python' | 'node' | 'java' | 'dotnet' | 'skipped'

interface IServerlessLandProject {
    asset: string
    handler?: string
}

export const appMap = new Map<string, IServerlessLandProject>([
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
    ['S3dotnet', { asset: 's3-lambda-resizing-dotnet.zip', handler: 'ImageResize/Function.cs' }],
    ['S3node', { asset: 's3-lambda-resizing-node.zip', handler: 'src/app.js' }],
    ['S3python', { asset: 's3-lambda-resizing-python.zip', handler: 'src/app.py' }],
    [
        'S3java',
        {
            asset: 's3-lambda-resizing-java.zip',
            handler: 'ResizerFunction/src/main/java/resizer/App.java',
        },
    ],
])

export class RuntimeLocationWizard extends Wizard<{
    runtime: TutorialRuntimeOptions
    dir: string
    realDir: vscode.Uri
}> {
    public constructor(skipRuntime: boolean, labelValue: string, existingTemplates?: vscode.Uri[]) {
        super()
        const form = this.form

        // step1: choose runtime
        const items: { label: string; data: TutorialRuntimeOptions }[] = [
            { label: 'Python', data: 'python' },
            { label: 'Node JS', data: 'node' },
            { label: 'Java', data: 'java' },
            { label: 'Dot Net', data: 'dotnet' },
        ]
        form.runtime.bindPrompter(
            () => {
                return createQuickPick(items, {
                    title: localize('AWS.toolkit.lambda.walkthroughSelectRuntime', 'Select a runtime'),
                    buttons: createCommonButtons(serverlessLandUrl),
                })
            },
            { showWhen: () => !skipRuntime }
        )

        // step2: choose location for project
        const wsFolders = vscode.workspace.workspaceFolders
        const items2 = [
            {
                label: localize('AWS.toolkit.lambda.walkthroughOpenExplorer', 'Open file explorer'),
                data: 'file-selector',
            },
        ]

        // if at least one open workspace, add all opened workspace as options
        if (wsFolders && labelValue !== 'Open existing Project') {
            for (const wsFolder of wsFolders) {
                items2.push({ label: wsFolder.uri.fsPath, data: wsFolder.uri.fsPath })
            }
        }

        if (wsFolders && existingTemplates && labelValue === 'Open existing Project') {
            existingTemplates.map((file) => {
                items2.push({ label: file.fsPath, data: path.dirname(file.fsPath) })
            })
        }

        form.dir.bindPrompter(() => {
            return createQuickPick(items2, {
                title:
                    labelValue === 'Open existing Project'
                        ? localize('AWS.toolkit.lambda.walkthroughOpenExistProject', 'Select an existing template file')
                        : localize('AWS.toolkit.lambda.walkthroughProjectLocation', 'Select a location for project'),
                buttons: createCommonButtons(labelValue === 'Open existing Project' ? undefined : serverlessLandUrl),
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
            setDefault: (state) => (state.dir ? vscode.Uri.file(state.dir) : undefined),
        })
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
        throw new ToolkitError(`Template '${project}+${runtime}' does not exist, choose another template.`)
    }

    try {
        await getPattern(serverlessLandOwner, serverlessLandRepo, appSelected.asset, outputDir, true)
    } catch (error) {
        throw new ToolkitError(`An error occurred while fetching this pattern from Serverless Land: ${error}`)
    }
}

/**
 * Takes projectUri and runtime then generate matching project
 * @param walkthroughSelected the selected walkthrough
 * @param projectUri The choosen project uri to generate proejct
 * @param runtime The runtime choosen
 */
export async function genWalkthroughProject(
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
        if (choice !== 'Yes') {
            throw new ToolkitError(`A file named ${defaultTemplateName} already exists in this path.`)
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
export async function openProjectInWorkspace(projectUri: vscode.Uri): Promise<void> {
    let templateUri: vscode.Uri | undefined = vscode.Uri.joinPath(projectUri, defaultTemplateName)
    if (!(await fs.exists(templateUri))) {
        // no template.yaml, trying yml
        templateUri = vscode.Uri.joinPath(projectUri, 'template.yml')
        if (!(await fs.exists(templateUri))) {
            templateUri = undefined
        }
    }

    // Open template file, and after update workspace folder
    if (templateUri) {
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(templateUri))
        // set global key to template to be opened, appComposer will open them upon reload
        await globals.globalState.update(templateToOpenAppComposer, [templateUri.fsPath])
    }

    // if extension is reloaded here, this function will never return (killed)
    await addFolderToWorkspace({ uri: projectUri, name: path.basename(projectUri.fsPath) }, true)

    // Open template file
    if (templateUri) {
        // extension not reloaded, set to false
        await globals.globalState.update(templateToOpenAppComposer, undefined)
        await vscode.commands.executeCommand('aws.openInApplicationComposer', templateUri)
    }

    // Open Readme if exist
    if (await fs.exists(vscode.Uri.joinPath(projectUri, 'README.md'))) {
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.joinPath(projectUri, 'README.md'))
    }
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
            getLogger().info('No walkthrough selected - exiting')
            void vscode.window.showErrorMessage(
                localize('AWS.toolkit.lambda.walkthroughNotSelected', 'Select a template in the walkthrough.')
            )
            return
        }
        let labelValue = 'Create Project'
        if (walkthroughSelected === 'CustomTemplate') {
            labelValue = 'Open existing Project'
        }
        // if these two, skip runtime choice
        const skipRuntimeChoice = walkthroughSelected === 'Visual' || walkthroughSelected === 'CustomTemplate'
        const templates: vscode.Uri[] =
            walkthroughSelected === 'CustomTemplate'
                ? await vscode.workspace.findFiles('**/{template.yaml,template.yml}', '**/.aws-sam/*')
                : []
        const result = await new RuntimeLocationWizard(skipRuntimeChoice, labelValue, templates).run()
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

export async function getOrUpdateOrInstallSAMCli(source: string) {
    try {
        // find sam
        const samPath = await getOrInstallCli('sam-cli', true, true)
        // check version
        const samCliVersion = (await new SamCliInfoInvocation(samPath).execute()).version

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
        }
    } catch (err) {
        throw ToolkitError.chain(err, 'Failed to install or detect SAM.')
    } finally {
        telemetry.record({ source: source, toolId: 'sam-cli' })
    }
}

/**
 * wraps getOrinstallCli and send telemetry
 * @param toolId to install/check
 * @param source to be added in telemetry
 */
export async function getOrInstallCliWrapper(toolId: AwsClis, source: string) {
    await telemetry.appBuilder_installTool.run(async (span) => {
        span.record({ source: source, toolId: toolId })
        if (toolId === 'sam-cli') {
            await getOrUpdateOrInstallSAMCli(source)
            return
        }
        try {
            await getOrInstallCli(toolId, true, true)
        } finally {
            telemetry.record({ source: source, toolId: toolId })
        }
    })
}
