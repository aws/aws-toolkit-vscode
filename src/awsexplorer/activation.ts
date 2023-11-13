/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { deleteCloudFormation } from '../lambda/commands/deleteCloudFormation'
import { CloudFormationStackNode } from '../lambda/explorer/cloudFormationNodes'
import globals from '../shared/extensionGlobals'
import { isCloud9, isSageMaker } from '../shared/extensionUtilities'
import { ExtContext } from '../shared/extensions'
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
import { createLocalExplorerView } from './localExplorer'
import { telemetry } from '../shared/telemetry/telemetry'
import { cdkNode, CdkRootNode } from '../cdk/explorer/rootNode'
import { CodeWhispererNode, getCodewhispererNode } from '../codewhisperer/explorer/codewhispererNode'
import { once } from '../shared/utilities/functionUtils'
import { CodeCatalystRootNode } from '../codecatalyst/explorer'
import { CodeCatalystAuthenticationProvider } from '../codecatalyst/auth'
import { S3FolderNode } from '../s3/explorer/s3FolderNode'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { submitFeedback } from '../feedback/vue/submitFeedback'

/**
 * Activates the AWS Explorer UI and related functionality.
 */
export async function activate(args: {
    context: ExtContext
    regionProvider: RegionProvider
    toolkitOutputChannel: vscode.OutputChannel
    remoteInvokeOutputChannel: vscode.OutputChannel
}): Promise<void> {
    const awsExplorer = new AwsExplorer(globals.context, args.regionProvider)

    const view = vscode.window.createTreeView(awsExplorer.viewProviderId, {
        treeDataProvider: awsExplorer,
        showCollapseAll: true,
    })
    view.onDidExpandElement(element => {
        if (element.element instanceof S3FolderNode) {
            globals.context.globalState.update('aws.lastTouchedS3Folder', {
                bucket: element.element.bucket,
                folder: element.element.folder,
            })
        }
        if (element.element.serviceId) {
            telemetry.aws_expandExplorerNode.emit({ serviceType: element.element.serviceId })
        }
    })
    globals.context.subscriptions.push(view)

    await registerAwsExplorerCommands(args.context, awsExplorer, args.toolkitOutputChannel)

    telemetry.vscode_activeRegions.emit({ value: args.regionProvider.getExplorerRegions().length })

    args.context.extensionContext.subscriptions.push(
        args.context.awsContext.onDidChangeContext(async credentialsChangedEvent => {
            getLogger().verbose(`Credentials changed (${credentialsChangedEvent.profileName}), updating AWS Explorer`)
            awsExplorer.refresh()

            if (credentialsChangedEvent.profileName) {
                await checkExplorerForDefaultRegion(args.regionProvider, awsExplorer)
            }
        })
    )

    const authProvider = CodeCatalystAuthenticationProvider.fromContext(args.context.extensionContext)
    const codecatalystNode = isCloud9('classic') || isSageMaker() ? [] : [new CodeCatalystRootNode(authProvider)]
    const nodes = [...codecatalystNode, cdkNode, getCodewhispererNode()]
    const developerTools = createLocalExplorerView(nodes)
    args.context.extensionContext.subscriptions.push(developerTools)

    // Legacy CDK behavior. Mostly useful for C9 as they do not have inline buttons.
    developerTools.onDidChangeVisibility(({ visible }) => visible && cdkNode.refresh())

    // Legacy CDK metric, remove this when we add something generic
    const recordExpandCdkOnce = once(() => telemetry.cdk_appExpanded.emit())
    const onDidExpandCodeWhisperer = once(() => telemetry.ui_click.emit({ elementId: 'cw_parentNode' }))
    developerTools.onDidExpandElement(e => {
        if (e.element.resource instanceof CdkRootNode) {
            recordExpandCdkOnce()
        } else if (e.element.resource instanceof CodeWhispererNode) {
            onDidExpandCodeWhisperer()
        }
    })

    registerDeveloperToolsCommands(args.context.extensionContext, developerTools, {
        codeCatalyst: codecatalystNode ? codecatalystNode[0] : undefined,
        codeWhisperer: getCodewhispererNode(),
    })
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
        submitFeedback.register(context),
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

async function registerDeveloperToolsCommands(
    ctx: vscode.ExtensionContext,
    developerTools: vscode.TreeView<TreeNode>,
    nodes: {
        codeWhisperer: CodeWhispererNode
        codeCatalyst: CodeCatalystRootNode | undefined
    }
) {
    /**
     * Registers a vscode command which shows the
     * node in the Developer Tools view.
     *
     * @param name name to use in the command
     * @param node node to show
     */
    const registerShowDeveloperToolsNode = (name: string, node: TreeNode) => {
        ctx.subscriptions.push(
            Commands.register(`aws.developerTools.show${name}`, async () => {
                if (!developerTools.visible) {
                    /**
                     * HACK: In the edge case where the Developer Tools view is
                     * not yet rendered (openend by user), we will expand the
                     * menu to trigger loading of the nodes
                     */
                    await vscode.commands.executeCommand('aws.developerTools.focus')
                }
                return developerTools.reveal(node, { expand: true, select: true, focus: true })
            })
        )
    }

    registerShowDeveloperToolsNode('CodeWhisperer', nodes.codeWhisperer)

    if (nodes.codeCatalyst) {
        registerShowDeveloperToolsNode('CodeCatalyst', nodes.codeCatalyst)
    }
}
