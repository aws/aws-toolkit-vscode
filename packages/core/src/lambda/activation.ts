/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { Lambda } from 'aws-sdk'
import { deleteLambda } from './commands/deleteLambda'
import { uploadLambdaCommand } from './commands/uploadLambda'
import { LambdaFunctionNode } from './explorer/lambdaFunctionNode'
import { downloadLambdaCommand, openLambdaFile } from './commands/downloadLambda'
import { tryRemoveFolder } from '../shared/filesystemUtilities'
import { ExtContext } from '../shared/extensions'
import { invokeRemoteLambda } from './vue/remoteInvoke/remoteInvokeBackend'
import { registerSamDebugInvokeVueCommand, registerSamInvokeVueCommand } from './vue/configEditor/samInvokeBackend'
import { Commands } from '../shared/vscode/commands2'
import { DefaultLambdaClient, getFunctionWithCredentials } from '../shared/clients/lambdaClient'
import { copyLambdaUrl } from './commands/copyLambdaUrl'
import { ResourceNode } from '../awsService/appBuilder/explorer/nodes/resourceNode'
import { isTreeNode, TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { getSourceNode } from '../shared/utilities/treeNodeUtils'
import { tailLogGroup } from '../awsService/cloudWatchLogs/commands/tailLogGroup'
import { liveTailRegistry, liveTailCodeLensProvider } from '../awsService/cloudWatchLogs/activation'
import { getFunctionLogGroupName } from '../awsService/cloudWatchLogs/activation'
import { ToolkitError, isError } from '../shared/errors'
import { LogStreamFilterResponse } from '../awsService/cloudWatchLogs/wizard/liveTailLogStreamSubmenu'
import { tempDirPath } from '../shared/filesystemUtilities'
import fs from '../shared/fs/fs'
import { deployFromTemp, editLambda, getReadme, openLambdaFolderForEdit } from './commands/editLambda'
import { getTempLocation } from './utils'
import { registerLambdaUriHandler } from './uriHandlers'

const localize = nls.loadMessageBundle()

/**
 * Activates Lambda components.
 */
export async function activate(context: ExtContext): Promise<void> {
    try {
        if (vscode.workspace.workspaceFolders) {
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                // Making the comparison case insensitive because Windows can have `C\` or `c\`
                const workspacePath = workspaceFolder.uri.fsPath.toLowerCase()
                const tempPath = path.join(tempDirPath, 'lambda').toLowerCase()
                if (workspacePath.startsWith(tempPath)) {
                    const name = path.basename(workspaceFolder.uri.fsPath)
                    const region = path.basename(path.dirname(workspaceFolder.uri.fsPath))
                    const getFunctionOutput = await getFunctionWithCredentials(region, name)
                    const configuration = getFunctionOutput.Configuration
                    await editLambda(
                        {
                            name,
                            region,
                            // Configuration as any due to the difference in types between sdkV2 and sdkV3
                            configuration: configuration as any,
                        },
                        true
                    )

                    const readmeUri = vscode.Uri.file(await getReadme())
                    await vscode.commands.executeCommand('markdown.showPreview', readmeUri, vscode.ViewColumn.Two)
                }
            }
        }
    } catch (e) {
        void vscode.window.showWarningMessage(
            localize('AWS.lambda.open.failure', `Unable to edit Lambda Function locally: ${e}`)
        )
    }

    context.extensionContext.subscriptions.push(
        Commands.register('aws.deleteLambda', async (node: LambdaFunctionNode | TreeNode) => {
            const sourceNode = getSourceNode<LambdaFunctionNode>(node)
            await deleteLambda(sourceNode.configuration, new DefaultLambdaClient(sourceNode.regionCode))
            await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', sourceNode.parent)
        }),
        Commands.register('aws.invokeLambda', async (node: LambdaFunctionNode | TreeNode) => {
            let source: string = 'AwsExplorerRemoteInvoke'
            if (isTreeNode(node)) {
                node = getSourceNode<LambdaFunctionNode>(node)
                source = 'AppBuilderRemoteInvoke'
            }
            await invokeRemoteLambda(context, {
                outputChannel: context.outputChannel,
                functionNode: node,
                source: source,
            })
        }),

        // Capture debug finished events, and delete the temporary directory if it exists
        vscode.debug.onDidTerminateDebugSession(async (session) => {
            if (
                session.configuration?.sam?.buildDir === undefined &&
                session.configuration?.baseBuildDir !== undefined
            ) {
                await tryRemoveFolder(session.configuration.baseBuildDir)
            }
        }),

        Commands.register('aws.downloadLambda', async (node: LambdaFunctionNode | TreeNode) => {
            const sourceNode = getSourceNode<LambdaFunctionNode>(node)
            await downloadLambdaCommand(sourceNode)
        }),

        Commands.register({ id: 'aws.uploadLambda', autoconnect: true }, async (arg?: unknown) => {
            if (arg instanceof LambdaFunctionNode) {
                await uploadLambdaCommand({
                    name: arg.functionName,
                    region: arg.regionCode,
                    configuration: arg.configuration,
                })
            } else if (arg instanceof vscode.Uri) {
                await uploadLambdaCommand(undefined, arg)
            } else {
                await uploadLambdaCommand()
            }
        }),

        Commands.register({ id: 'aws.quickDeployLambda' }, async (node: LambdaFunctionNode) => {
            const functionName = node.configuration.FunctionName!
            const region = node.regionCode
            const lambda = { name: functionName, region, configuration: node.configuration }
            const tempLocation = getTempLocation(functionName, region)

            if (await fs.existsDir(tempLocation)) {
                await deployFromTemp(lambda, vscode.Uri.file(tempLocation))
            }
        }),

        Commands.register('aws.openLambdaFile', async (path: string) => {
            await openLambdaFile(path)
        }),

        Commands.register('aws.lambda.openWorkspace', async (node: LambdaFunctionNode) => {
            await openLambdaFolderForEdit(node.functionName, node.regionCode)
        }),

        Commands.register('aws.copyLambdaUrl', async (node: LambdaFunctionNode | TreeNode) => {
            const sourceNode = getSourceNode<LambdaFunctionNode>(node)
            await copyLambdaUrl(sourceNode, new DefaultLambdaClient(sourceNode.regionCode))
        }),

        registerSamInvokeVueCommand(context.extensionContext),

        Commands.register('aws.launchDebugConfigForm', async (node: ResourceNode) =>
            registerSamDebugInvokeVueCommand(context.extensionContext, { resource: node })
        ),

        Commands.register('aws.appBuilder.tailLogs', async (node: LambdaFunctionNode | TreeNode) => {
            let functionConfiguration: Lambda.FunctionConfiguration
            try {
                const sourceNode = getSourceNode<LambdaFunctionNode>(node)
                functionConfiguration = sourceNode.configuration
                const logGroupInfo = {
                    regionName: sourceNode.regionCode,
                    groupName: getFunctionLogGroupName(functionConfiguration),
                }

                const source = isTreeNode(node) ? 'AppBuilder' : 'AwsExplorerLambdaNode'
                // Show all log streams without having to choose
                const logStreamFilterData: LogStreamFilterResponse = { type: 'all' }
                await tailLogGroup(
                    liveTailRegistry,
                    source,
                    liveTailCodeLensProvider,
                    logGroupInfo,
                    logStreamFilterData
                )
            } catch (err) {
                if (isError(err as Error, 'ResourceNotFoundException', "LogGroup doesn't exist.")) {
                    // If we caught this error, then we know `functionConfiguration` actually has a value
                    throw ToolkitError.chain(
                        err,
                        `Unable to fetch logs. Log group for function '${functionConfiguration!.FunctionName}' does not exist. ` +
                            'Invoking your function at least once will create the log group.'
                    )
                } else {
                    throw err
                }
            }
        }),

        registerLambdaUriHandler()
    )
}
