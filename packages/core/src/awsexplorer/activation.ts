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
import { initWalkthroughProjectCommand, walkthroughContextString } from '../shared/applicationBuilder/walkthrough'
import { tools } from '../shared/utilities/guiInstall'

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

    // recover context variables from global state when activate
    const walkthroughSelected = globals.globalState.get<string>(walkthroughContextString)
    if (walkthroughSelected !== undefined) {
        await setContext(walkthroughContextString, walkthroughSelected)
    }
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

async function setWalkthrough(walkthroughSelected: string = 'S3'): Promise<void> {
    await setContext(walkthroughContextString, walkthroughSelected)
    await globals.globalState.update(walkthroughContextString, walkthroughSelected)
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
    context.extensionContext.subscriptions.push(
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
        Commands.register('aws.toolkit.installSAMCLI', async () => {
            await tools.sam.installGui()
        }),
        Commands.register('aws.toolkit.installAWSCLI', async () => {
            await tools.aws.installGui()
        }),
        Commands.register('aws.toolkit.installDocker', async () => {
            await tools.docker.installGui()
        }),
        Commands.register('aws.toolkit.lambda.initializeWalkthroughProject', async (): Promise<void> => {
            await initWalkthroughProjectCommand()
            await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', true)
        }),
        Commands.register(`aws.toolkit.lambda.openWalkthrough`, async () => {
            await vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'amazonwebservices.aws-toolkit-vscode#aws.toolkit.lambda.walkthrough'
            )
        })
    )
}
