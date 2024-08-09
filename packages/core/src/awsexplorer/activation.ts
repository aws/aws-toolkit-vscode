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

const localize = nls.loadMessageBundle()
const serverlessLandUrl = 'https://serverlessland.com/'

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
    const setWalkthrough = (name: string = 'S3') => {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', name)
        context.extensionContext.globalState.update('walkthroughSelected', name)
    }

    // recover context variables from global state when activate
    const walkthroughSelected = context.extensionContext.globalState.get('walkthroughSelected')
    if (walkthroughSelected != undefined) {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', walkthroughSelected)
    } else {
        vscode.commands.executeCommand('setContext', 'walkthroughSelected', 'None')
    }

    const getProjectUri = (dir: string) => {
        const wsFolders = vscode.workspace.workspaceFolders
        if (dir == 'file-selector') {
            let options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Create Project',
                canSelectFiles: false,
                canSelectFolders: true,
            }
            if (wsFolders) {
                options.defaultUri = wsFolders[0]?.uri
            }

            return vscode.window.showOpenDialog(options).then((fileUri) => {
                if (fileUri && fileUri[0]) {
                    console.log('file choose')
                    return Promise.resolve(fileUri[0])
                }
                return Promise.resolve(undefined)
            })
        }
        // option2:workspce filepath returned
        return vscode.Uri.parse(dir)
    }

    /**
     * create wizard to choose runtime/Location
     */
    const chooseRuntimeLocaltionWizard = new (class ExampleWizard extends Wizard<{
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

    interface IServerlessLandProject {
        asset: string
        handler: string
        template: string
    }

    /**
     * Takes projectUri and runtime then generate matching project
     * @param projectUri The choosen project uri to generate proejct
     * @param runtime The runtime choosen
     */
    async function genWalkthroughProject(projectUri: vscode.Uri, runtime: string): Promise<void> {
        // create project here
        // TODO update with file fetching from serverless land
        const walkthroughSelected = context.extensionContext.globalState.get('walkthroughSelected')

        let appMap = new Map<string, IServerlessLandProject>()
        appMap.set('APIpython', {
            asset: 'hello-world-sam',
            handler: 'hello_world/app.py',
            template: 'template.yaml',
        })
        appMap.set('APInode', { asset: 'apigw-iam', handler: 'src/app.js', template: 'template.yaml' })
        appMap.set('APIpython', {
            asset: 'hello-world-sam',
            handler: 'hello_world/app.py',
            template: 'template.yaml',
        })

        const appSelected = appMap.get(walkthroughSelected + runtime)
        if (!appSelected) {
            throw new ToolkitError(
                `Tried to get template '${walkthroughSelected}+${runtime}', but it hasn't been registered.`
            )
        }

        // await getServerlesslandPattern(projectOwner, projectRepo, appSelected.asset, projectUri)
        const lambdaUri = vscode.Uri.joinPath(projectUri, appSelected.asset, appSelected.handler)
        const templateUri = vscode.Uri.joinPath(projectUri, appSelected.asset, appSelected.template)
        await vscode.commands.executeCommand('explorer.openToSide', lambdaUri)
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        await vscode.commands.executeCommand('explorer.openToSide', templateUri)
        await vscode.commands.executeCommand('aws.openInApplicationComposer', templateUri)
    }

    context.extensionContext.subscriptions.push(
        Commands.register('aws.toolkit.setWalkthroughToAPI', async () => {
            setWalkthrough('API')
        }),
        Commands.register('aws.toolkit.setWalkthroughToS3', async () => {
            setWalkthrough('S3')
        }),
        Commands.register('aws.toolkit.setWalkthroughToVisual', async () => {
            setWalkthrough('Visual')
        }),
        Commands.register('aws.toolkit.setWalkthroughToCustomTemplate', async () => {
            setWalkthrough('CustomTemplate')
        }),
        Commands.register('aws.toolkit.getWalkthrough', (async) => {
            const walkthroughSelected = context.extensionContext.globalState.get('walkthroughSelected')
            return walkthroughSelected
        }),
        Commands.register('aws.toolkit.getRuntime', (async) => {
            const walkthroughRuntime = context.extensionContext.globalState.get('walkthroughRuntime')
            return walkthroughRuntime
        }),
        Commands.register('aws.toolkit.installSAMCLI', async () => {
            // await tools.sam.installGui()
        }),
        Commands.register('aws.toolkit.installAWSCLI', async () => {
            // await tools.aws.installGui()
        }),
        Commands.register('aws.toolkit.installDocker', async () => {
            // await tools.docker.installGui()
        }),
        Commands.register('aws.toolkit.getRuntimeQuickPick', async () => {
            const result = await chooseRuntimeLocaltionWizard.run()
            console.log(result)
            if (!result) {
                return undefined
            }

            let projectUri = await getProjectUri(result.dir)
            if (!projectUri) {
                // exit for non-vaild uri
                console.log('exit on customer cancellation')
                return
            }
            // generate project
            await genWalkthroughProject(projectUri, result.runtime)
        }),
        Commands.register(`aws.toolkit.walkthrough`, async () => {
            vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'amazonwebservices.aws-toolkit-vscode#aws.gettingStarted.walkthrough'
            )
        })
    )
}
