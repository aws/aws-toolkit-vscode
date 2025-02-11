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
import { getLogger } from '../shared/logger/logger'
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
import { isExtensionInstalled } from '../shared/utilities/vsCodeUtils'
import { CommonAuthViewProvider } from '../login/webview/commonAuthViewProvider'
import { setContext } from '../shared/vscode/setContext'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { getSourceNode } from '../shared/utilities/treeNodeUtils'
import { openAwsCFNConsoleCommand, openAwsConsoleCommand } from '../shared/awsConsole'
import { StackNameNode } from '../awsService/appBuilder/explorer/nodes/deployedStack'

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

    const viewNodes: ToolView[] = [
        ...amazonQViewNode,
        ...codecatalystViewNode,
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
        Commands.register('aws.copyArn', async (node: AWSResourceNode | TreeNode) => {
            const sourceNode = getSourceNode<AWSResourceNode>(node)
            await copyTextCommand(sourceNode, 'ARN')
        }),
        Commands.register('aws.copyName', async (node: AWSResourceNode | TreeNode) => {
            const sourceNode = getSourceNode<AWSResourceNode>(node)
            await copyTextCommand(sourceNode, 'name')
        }),
        Commands.register('aws.openAwsConsole', async (node: AWSResourceNode | TreeNode) => {
            const sourceNode = getSourceNode<AWSResourceNode>(node)
            await openAwsConsoleCommand(sourceNode)
        }),
        Commands.register('aws.openAwsCFNConsole', async (node: StackNameNode) => {
            await openAwsCFNConsoleCommand(node)
        }),
        Commands.register('aws.refreshAwsExplorerNode', async (element: AWSTreeNodeBase | undefined) => {
            awsExplorer.refresh(element)
        }),
        loadMoreChildrenCommand.register(awsExplorer)
    )
}
