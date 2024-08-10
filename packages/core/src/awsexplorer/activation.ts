/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { deleteCloudFormation } from '../lambda/commands/deleteCloudFormation'
import { CloudFormationStackNode } from '../lambda/explorer/cloudFormationNodes'
import globals from '../shared/extensionGlobals'
import { isCloud9, isSageMaker } from '../shared/extensionUtilities'
import { ExtContext, VSCODE_EXTENSION_ID } from '../shared/extensions'
import { getLogger } from '../shared/logger'
import { RegionProvider } from '../shared/regions/regionProvider'
import { AWSResourceNode } from '../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { Commands } from '../shared/vscode/commands2'
import { downloadStateMachineDefinition } from '../stepFunctions/commands/downloadStateMachineDefinition'
import { executeStateMachine } from '../stepFunctions/vue/executeStateMachine/executeStateMachine'
import { StateMachineNode } from '../stepFunctions/explorer/stepFunctionsNodes'
import { AwsExplorer } from './awsExplorer'
import { copyTextCommand } from './commands/copyText'
import { loadMoreChildrenCommand } from './commands/loadMoreChildren'
import { checkExplorerForDefaultRegion } from './defaultRegion'
import { ToolView } from './toolView'
import { telemetry } from '../shared/telemetry/telemetry'
import { CdkRootNode } from '../awsService/cdk/explorer/rootNode'
import { CodeCatalystRootNode } from '../codecatalyst/explorer'
import { CodeCatalystAuthenticationProvider } from '../codecatalyst/auth'
import { S3FolderNode } from '../awsService/s3/explorer/s3FolderNode'
import { AmazonQNode, refreshAmazonQ, refreshAmazonQRootNode } from '../amazonq/explorer/amazonQTreeNode'
import { activateViewsShared, registerToolView } from './activationShared'
import { isExtensionInstalled } from '../shared/utilities'
import { CommonAuthViewProvider } from '../login/webview'
import { setContext } from '../shared'
import { AppBuilderRootNode } from '../shared/applicationBuilder/explorer/nodes/rootNode'
import { Wizard } from '../shared/wizards/wizard'
import { createQuickPick } from '../shared/ui/pickerPrompter'
import { createCommonButtons } from '../shared/ui/buttons'
import * as nls from 'vscode-nls'
import { ToolkitError } from '../shared/errors'
import { SkipPrompter } from '../shared/ui/common/skipPrompter'
import { getWalkthrough } from '../shared/utilities/serverlessLand'
import path from 'path'
import { tools } from '../shared/utilities/guiInstall'

const localize = nls.loadMessageBundle()
const serverlessLandUrl = 'https://serverlessland.com/'
const walkthroughContextString = 'aws.toolkit.walkthroughSelected'
const defaultTemplateName = 'template.yaml'

/**
 * Activates the AWS Explorer UI and related functionality.
 *
 * IMPORTANT: Views that should work in all vscode environments (node or web)
 * should be setup in {@link activateViewsShared}.
 */
export async function activate(args: {
    context: ExtContext
    regionProvider: RegionProvider
    toolkitOutputChannel: vscode.OutputChannel
}): Promise<void> {
    const awsExplorer = new AwsExplorer(globals.context, args.regionProvider)

    const view = vscode.window.createTreeView(awsExplorer.viewProviderId, {
        treeDataProvider: awsExplorer,
        showCollapseAll: true,
    })
    view.onDidExpandElement((element) => {
        if (element.element instanceof S3FolderNode) {
            globals.globalState.tryUpdate('aws.lastTouchedS3Folder', {
                bucket: element.element.bucket,
                folder: element.element.folder,
            })
        }
        if (element.element.serviceId) {
            telemetry.aws_expandExplorerNode.emit({ serviceType: element.element.serviceId, result: 'Succeeded' })
        }
    })
    globals.context.subscriptions.push(view)

    await registerAwsExplorerCommands(args.context, awsExplorer, args.toolkitOutputChannel)
    await registerAppBuilderCommands(args.context, args.toolkitOutputChannel)

    telemetry.vscode_activeRegions.emit({ value: args.regionProvider.getExplorerRegions().length })

    args.context.extensionContext.subscriptions.push(
        args.context.awsContext.onDidChangeContext(async (credentialsChangedEvent) => {
            getLogger().verbose(`Credentials changed (${credentialsChangedEvent.profileName}), updating AWS Explorer`)
            awsExplorer.refresh()

            if (credentialsChangedEvent.profileName) {
                await checkExplorerForDefaultRegion(args.regionProvider, awsExplorer)
            }
        })
    )

    const authProvider = CodeCatalystAuthenticationProvider.fromContext(args.context.extensionContext)
    const codecatalystViewNode: ToolView[] = []
    let codecatalystNode: CodeCatalystRootNode | undefined

    const shouldShowCodeCatalyst = !(isCloud9('classic') || isSageMaker())
    if (shouldShowCodeCatalyst) {
        codecatalystNode = new CodeCatalystRootNode(authProvider)
        codecatalystViewNode.push({
            nodes: [codecatalystNode],
            view: 'aws.codecatalyst',
            refreshCommands: [
                (provider) => {
                    codecatalystNode!.addRefreshEmitter(() => provider.refresh())
                },
            ],
        })
    }
    // CodeCatalyst view may not be present. Wrap VS Code-owned command to avoid warning toasts if missing
    args.context.extensionContext.subscriptions.push(
        Commands.register(`aws.codecatalyst.maybeFocus`, async () => {
            if (shouldShowCodeCatalyst) {
                // vs code-owned command
                await vscode.commands.executeCommand('aws.codecatalyst.focus')
            }
        })
    )

    const amazonQViewNode: ToolView[] = []
    if (!isCloud9()) {
        if (
            isExtensionInstalled(VSCODE_EXTENSION_ID.amazonq) ||
            globals.globalState.get<boolean>('aws.toolkit.amazonq.dismissed')
        ) {
            await setContext('aws.toolkit.amazonq.dismissed', true)
        }

        // We should create the tree even if it's dismissed, in case the user installs Amazon Q later.
        amazonQViewNode.push({
            nodes: [AmazonQNode.instance],
            view: 'aws.amazonq.codewhisperer',
            refreshCommands: [refreshAmazonQ, refreshAmazonQRootNode],
        })
    }
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

    const viewNodes: ToolView[] = [
        ...amazonQViewNode,
        ...codecatalystViewNode,
        ...appBuilderNode,
        { nodes: [CdkRootNode.instance], view: 'aws.cdk', refreshCommands: [CdkRootNode.instance.refreshCdkExplorer] },
    ]
    for (const viewNode of viewNodes) {
        registerToolView(viewNode, args.context.extensionContext)
    }

    const toolkitAuthProvider = new CommonAuthViewProvider(args.context.extensionContext, 'toolkit')
    args.context.extensionContext.subscriptions.push(
        vscode.window.registerWebviewViewProvider(toolkitAuthProvider.viewType, toolkitAuthProvider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),
        // Hacky way for a webview to call setLoginService().
        vscode.commands.registerCommand('aws.explorer.setLoginService', (serviceToShow?: string) => {
            if (toolkitAuthProvider.webView && 'setLoginService' in toolkitAuthProvider.webView.server) {
                toolkitAuthProvider.webView.server.setLoginService(serviceToShow)
            }
        })
    )
}

async function registerAwsExplorerCommands(
    context: ExtContext,
    awsExplorer: AwsExplorer,
    toolkitOutputChannel: vscode.OutputChannel
): Promise<void> {
    context.extensionContext.subscriptions.push(
        Commands.register({ id: 'aws.showRegion', autoconnect: false }, async () => {
            try {
                await globals.awsContextCommands.onCommandShowRegion()
            } finally {
                telemetry.aws_setRegion.emit()
                telemetry.vscode_activeRegions.emit({ value: awsExplorer.getRegionNodesSize() })
            }
        }),
        Commands.register({ id: 'aws.refreshAwsExplorer', autoconnect: true }, async (passive: boolean = false) => {
            awsExplorer.refresh()

            if (!passive) {
                telemetry.aws_refreshExplorer.emit()
            }
        }),
        Commands.register(
            { id: 'aws.deleteCloudFormation', autoconnect: true },
            async (node: CloudFormationStackNode) =>
                await deleteCloudFormation(() => awsExplorer.refresh(node.parent), node)
        ),
        Commands.register(
            { id: 'aws.downloadStateMachineDefinition', autoconnect: true },
            async (node: StateMachineNode) =>
                await downloadStateMachineDefinition({
                    stateMachineNode: node,
                    outputChannel: toolkitOutputChannel,
                })
        )
    )

    context.extensionContext.subscriptions.push(
        Commands.register(
            'aws.executeStateMachine',
            async (node: StateMachineNode) => await executeStateMachine(context, node)
        ),
        Commands.register(
            'aws.renderStateMachineGraph',
            async (node: StateMachineNode) =>
                await downloadStateMachineDefinition({
                    stateMachineNode: node,
                    outputChannel: toolkitOutputChannel,
                    isPreviewAndRender: true,
                })
        ),
        Commands.register('aws.copyArn', async (node: AWSResourceNode) => await copyTextCommand(node, 'ARN')),
        Commands.register('aws.copyName', async (node: AWSResourceNode) => await copyTextCommand(node, 'name')),
        Commands.register('aws.refreshAwsExplorerNode', async (element: AWSTreeNodeBase | undefined) => {
            awsExplorer.refresh(element)
        }),
        loadMoreChildrenCommand.register(awsExplorer)
    )
}

/**
 *
 * @param context VScode Context
 * @param toolkitOutputChannel Output channel for logging
 */
async function registerAppBuilderCommands(
    context: ExtContext,
    toolkitOutputChannel: vscode.OutputChannel
): Promise<void> {
    async function setWalkthrough(walkthroughSelected: string = 'S3'): Promise<void> {
        await setContext(walkthroughContextString, walkthroughSelected)
        await globals.globalState.update(walkthroughContextString, walkthroughSelected)
    }

    // recover context variables from global state when activate
    const walkthroughSelected = globals.globalState.get<string>(walkthroughContextString)
    if (walkthroughSelected !== undefined) {
        await setContext(walkthroughContextString, walkthroughSelected)
    }

    async function fileExist(path: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(path)
            return true
        } catch {
            return false
        }
    }

    class RuntimeLocationWizard extends Wizard<{
        runtime: string
        dir: string
    }> {
        public constructor(skipRuntime: boolean) {
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
                        title: localize('AWS.toolkit.walkthrough.selectruntime', 'Select a runtime'),
                        buttons: createCommonButtons(serverlessLandUrl),
                    })
                })
            }

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
                for (const wsFolder of wsFolders) {
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
    }

    /**
     * Get the actual file Uri from Wizard results. If Customer chooses 'file-selector' option, the input dir='file-selector'
     * In this case, a file selector will popup for customer to choose dir. Returns a vscode.Uri
     * @param dir 'file-selector' or string representation of a file-path
     * @param labelValue 'open folder' label in file-selector. Currently either 'Create Project' or 'Open existing Project'
     */
    const getProjectUri = (dir: string, labelValue: string) => {
        const wsFolders = vscode.workspace.workspaceFolders
        if (dir === 'file-selector') {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: labelValue,
                canSelectFiles: false,
                canSelectFolders: true,
            }
            if (wsFolders) {
                options.defaultUri = wsFolders[0]?.uri
            }

            return vscode.window.showOpenDialog(options).then(
                (fileUri) => {
                    if (fileUri && fileUri[0]) {
                        toolkitOutputChannel.append('file choose')
                        return Promise.resolve(fileUri[0])
                    }
                    return Promise.resolve(undefined)
                },
                (error) => {
                    toolkitOutputChannel.append(`file selector error ${error}`)
                    return
                }
            )
        }
        // option2:workspce filepath returned
        return vscode.Uri.parse(dir)
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
        if (await fileExist(templateUri)) {
            // ask if want to overwrite
            const choice = await vscode.window.showInformationMessage(
                localize(
                    'AWS.toolkit.createProjectPrompt',
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
            await vscode.workspace.fs.writeFile(templateUri, Buffer.from(''))
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
        if (!(await fileExist(templateUri))) {
            // no template is found
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.toolkit.samTemplateNotFound',
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
                toolkitOutputChannel.append(`checking ${projectUri.fsPath} vs ${folder.uri.fsPath}`)
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
        // add project dir to workspace
        vscode.workspace.updateWorkspaceFolders(0, 0, { uri: projectUri })
    }

    context.extensionContext.subscriptions.push(
        Commands.register('aws.toolkit.setWalkthroughToAPI', async () => {
            await setWalkthrough('API')
        }),
        Commands.register('aws.toolkit.setWalkthroughToS3', async () => {
            await setWalkthrough('S3')
        }),
        Commands.register('aws.toolkit.setWalkthroughToVisual', async () => {
            await setWalkthrough('Visual')
        }),
        Commands.register('aws.toolkit.setWalkthroughToCustomTemplate', async () => {
            await setWalkthrough('CustomTemplate')
        }),
        Commands.register('aws.toolkit.installSAMCLI', async () => {
            await tools.sam.installGui()
        }),
        Commands.register('aws.toolkit.installAWSCLI', async () => {
            await tools.aws.installGui()
        }),
        Commands.register('aws.toolkit.installDocker', async () => {
            await tools.docker.installGui()
        }),
        Commands.register('aws.toolkit.initializeWalkthroughProject', async (): Promise<void> => {
            const walkthroughSelected = globals.globalState.get(walkthroughContextString)
            if (!walkthroughSelected || !(typeof walkthroughSelected === 'string')) {
                toolkitOutputChannel.append('exit on no walkthrough selected')
                return
            }
            // if these two, skip runtime choice
            const skipRuntimeChoice = walkthroughSelected === 'Visual' || walkthroughSelected === 'CustomTemplate'
            const result = await new RuntimeLocationWizard(skipRuntimeChoice).run()
            if (!result) {
                toolkitOutputChannel.append('exit on customer quickpick cancellation')
                return
            }
            let labelValue = 'Create Project'
            if (walkthroughSelected === 'CustomTemplate') {
                labelValue = 'Open existing Project'
            }
            const projectUri = await getProjectUri(result.dir, labelValue)
            if (!projectUri || !fileExist(projectUri)) {
                // exit for non-vaild uri
                toolkitOutputChannel.append('exit on customer fileselector cancellation')
                return
            }

            // generate project
            await genWalkthroughProject(walkthroughSelected, projectUri, result.runtime)
            // open a workspace if no workspace yet
            await openProjectInWorkspace(projectUri)
        }),
        Commands.register(`aws.toolkit.walkthrough`, async () => {
            await vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'amazonwebservices.aws-toolkit-vscode#aws.gettingStarted.walkthrough'
            )
        })
    )
}
