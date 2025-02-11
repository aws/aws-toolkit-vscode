/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { ExtContext } from '../../shared/extensions'
import { Commands, VsCodeCommandArg } from '../../shared/vscode/commands2'
import { ToolView } from '../../awsexplorer/toolView'
import { telemetry } from '../../shared/telemetry/telemetry'
import { activateViewsShared, registerToolView } from '../../awsexplorer/activationShared'
import { setContext } from '../../shared/vscode/setContext'
import { fs } from '../../shared/fs/fs'
import { AppBuilderRootNode } from './explorer/nodes/rootNode'
import { initWalkthroughProjectCommand, walkthroughContextString, getOrInstallCliWrapper } from './walkthrough'
import { getLogger } from '../../shared/logger/logger'
import path from 'path'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { runBuild } from '../../shared/sam/build'
import { runOpenHandler, runOpenTemplate } from './utils'
import { ResourceNode } from './explorer/nodes/resourceNode'
import { getSyncWizard, runSync } from '../../shared/sam/sync'
import { getDeployWizard, runDeploy } from '../../shared/sam/deploy'
import { DeployTypeWizard } from './wizards/deployTypeWizard'

export const templateToOpenAppComposer = 'aws.toolkit.appComposer.templateToOpenOnStart'

/**
 * Activates the AWS Explorer UI and related functionality.
 *
 * IMPORTANT: Views that should work in all vscode environments (node or web)
 * should be setup in {@link activateViewsShared}.
 */
export async function activate(context: ExtContext): Promise<void> {
    // recover context variables from global state when activate
    const walkthroughSelected = globals.globalState.get<string>(walkthroughContextString)
    if (walkthroughSelected !== undefined) {
        await setContext(walkthroughContextString, walkthroughSelected)
    }

    await registerAppBuilderCommands(context)

    const appBuilderNode: ToolView[] = [
        {
            nodes: [AppBuilderRootNode.instance],
            view: 'aws.appBuilder',
            refreshCommands: [AppBuilderRootNode.instance.refreshAppBuilderExplorer],
        },
        {
            nodes: [AppBuilderRootNode.instance],
            view: 'aws.appBuilderForFileExplorer',
            refreshCommands: [AppBuilderRootNode.instance.refreshAppBuilderForFileExplorer],
        },
    ]

    const watcher = vscode.workspace.createFileSystemWatcher('**/{template.yaml,template.yml,samconfig.toml}')
    watcher.onDidChange(async (uri) => runRefreshAppBuilder(uri, 'changed'))
    watcher.onDidCreate(async (uri) => runRefreshAppBuilder(uri, 'created'))
    watcher.onDidDelete(async (uri) => runRefreshAppBuilder(uri, 'deleted'))

    for (const viewNode of appBuilderNode) {
        registerToolView(viewNode, context.extensionContext)
    }

    await openApplicationComposerAfterReload()
}

async function runRefreshAppBuilder(uri: vscode.Uri, event: string) {
    getLogger().debug(`${uri.fsPath} ${event}, refreshing appBuilder`)
    await vscode.commands.executeCommand('aws.appBuilderForFileExplorer.refresh')
    await vscode.commands.executeCommand('aws.appBuilder.refresh')
}

/**
 * To support open template in AppComposer after extension reload.
 * This typically happens when user create project from walkthrough
 * and added a new folder to an empty workspace.
 *
 * Checkes templateToOpenAppComposer in global and opens template
 * Directly return if templateToOpenAppComposer is undefined
 */
export async function openApplicationComposerAfterReload(): Promise<void> {
    const templatesToOpen = globals.globalState.get<[string]>(templateToOpenAppComposer)
    // undefined
    if (!templatesToOpen) {
        return
    }

    for (const template of templatesToOpen) {
        const templateUri = vscode.Uri.file(template)
        const templateFolder = vscode.Uri.file(path.dirname(template))
        const basename = path.basename(template)
        // ignore templates that doesn't belong to current workspace, ignore if not template
        if (
            !vscode.workspace.getWorkspaceFolder(templateFolder) ||
            (basename !== 'template.yaml' && basename !== 'template.yml')
        ) {
            continue
        }

        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        await vscode.commands.executeCommand('aws.openInApplicationComposer', templateUri)

        if (await fs.exists(vscode.Uri.joinPath(templateFolder, 'README.md'))) {
            await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
            await vscode.commands.executeCommand(
                'markdown.showPreview',
                vscode.Uri.joinPath(templateFolder, 'README.md')
            )
        }
    }
    // set to undefined
    await globals.globalState.update(templateToOpenAppComposer, undefined)
}

async function setWalkthrough(walkthroughSelected: string = 'S3'): Promise<void> {
    await setContext(walkthroughContextString, walkthroughSelected)
    await globals.globalState.update(walkthroughContextString, walkthroughSelected)
}

/**
 *
 * @param context VScode Context
 */
async function registerAppBuilderCommands(context: ExtContext): Promise<void> {
    const source = 'AppBuilderWalkthrough'
    context.extensionContext.subscriptions.push(
        Commands.register('aws.toolkit.installSAMCLI', async () => {
            await getOrInstallCliWrapper('sam-cli', source)
        }),
        Commands.register('aws.toolkit.installAWSCLI', async () => {
            await getOrInstallCliWrapper('aws-cli', source)
        }),
        Commands.register('aws.toolkit.installDocker', async () => {
            await getOrInstallCliWrapper('docker', source)
        }),
        Commands.register('aws.toolkit.lambda.setWalkthroughToAPI', async () => {
            await setWalkthrough('API')
        }),
        Commands.register('aws.toolkit.lambda.setWalkthroughToS3', async () => {
            await setWalkthrough('S3')
        }),
        Commands.register('aws.toolkit.lambda.setWalkthroughToVisual', async () => {
            await setWalkthrough('Visual')
        }),
        Commands.register('aws.toolkit.lambda.setWalkthroughToCustomTemplate', async () => {
            await setWalkthrough('CustomTemplate')
        }),
        Commands.register('aws.toolkit.lambda.initializeWalkthroughProject', async (): Promise<void> => {
            await telemetry.appBuilder_selectWalkthroughTemplate.run(async () => await initWalkthroughProjectCommand())
            await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', true)
        }),
        Commands.register('aws.toolkit.lambda.walkthrough.credential', async (): Promise<void> => {
            await vscode.commands.executeCommand('aws.toolkit.auth.manageConnections', source)
        }),
        Commands.register(
            { id: `aws.toolkit.lambda.openWalkthrough`, compositeKey: { 1: 'source' } },
            async (_: VsCodeCommandArg, source?: string) => {
                telemetry.appBuilder_startWalkthrough.emit({ source: source })
                await vscode.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    'amazonwebservices.aws-toolkit-vscode#aws.toolkit.lambda.walkthrough'
                )
            }
        ),
        Commands.register(
            {
                id: 'aws.appBuilder.build',
                autoconnect: false,
            },
            async (arg?: TreeNode | undefined) => await telemetry.sam_build.run(async () => await runBuild(arg))
        ),
        Commands.register({ id: 'aws.appBuilder.openTemplate', autoconnect: false }, async (arg: TreeNode) =>
            telemetry.appBuilder_openTemplate.run(async (span) => {
                if (arg) {
                    span.record({ source: 'AppBuilderOpenTemplate' })
                } else {
                    span.record({ source: 'commandPalette' })
                }
                await runOpenTemplate(arg)
            })
        ),
        Commands.register({ id: 'aws.appBuilder.openHandler', autoconnect: false }, async (arg: ResourceNode) =>
            telemetry.lambda_goToHandler.run(async (span) => {
                span.record({ source: 'AppBuilderOpenHandler' })
                await runOpenHandler(arg)
            })
        ),
        Commands.register({ id: 'aws.appBuilder.deploy', autoconnect: true }, async (arg) => {
            const wizard = new DeployTypeWizard(
                await getSyncWizard('infra', arg, undefined, false),
                await getDeployWizard(arg, false)
            )
            const choices = await wizard.run()
            if (choices) {
                if (choices.choice === 'deploy' && choices.deployParam) {
                    await runDeploy(arg, choices.deployParam)
                } else if (choices.choice === 'sync' && choices.syncParam) {
                    await runSync('infra', arg, undefined, choices.syncParam)
                }
            }
        })
    )
}
