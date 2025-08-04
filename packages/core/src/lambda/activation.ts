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
import { invokeRemoteLambda } from './vue/remoteInvoke/invokeLambda'
import { registerSamDebugInvokeVueCommand, registerSamInvokeVueCommand } from './vue/configEditor/samInvokeBackend'
import { Commands } from '../shared/vscode/commands2'
import { DefaultLambdaClient } from '../shared/clients/lambdaClient'
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
import {
    confirmOutdatedChanges,
    deleteFilesInFolder,
    deployFromTemp,
    getReadme,
    openLambdaFolderForEdit,
    watchForUpdates,
} from './commands/editLambda'
import { compareCodeSha, getFunctionInfo, getTempLocation, setFunctionInfo } from './utils'
import { registerLambdaUriHandler } from './uriHandlers'
import globals from '../shared/extensionGlobals'

const localize = nls.loadMessageBundle()
import { activateRemoteDebugging } from './remoteDebugging/ldkController'
import { ExtContext } from '../shared/extensions'

async function openReadme() {
    const readmeUri = vscode.Uri.file(await getReadme())
    // We only want to do it if there's not a readme already
    const isPreviewOpen = vscode.window.tabGroups.all.some((group) =>
        group.tabs.some((tab) => tab.label.includes('README'))
    )
    if (!isPreviewOpen) {
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    }
}

async function quickEditActivation() {
    if (vscode.workspace.workspaceFolders) {
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            // Making the comparison case insensitive because Windows can have `C\` or `c\`
            const workspacePath = workspaceFolder.uri.fsPath.toLowerCase()
            const tempPath = path.join(tempDirPath, 'lambda').toLowerCase()
            if (workspacePath.includes(tempPath)) {
                const name = path.basename(workspaceFolder.uri.fsPath)
                const region = path.basename(path.dirname(workspaceFolder.uri.fsPath))

                const lambda = { name, region, configuration: undefined }

                watchForUpdates(lambda, vscode.Uri.file(workspacePath))

                await openReadme()

                // Open handler function
                try {
                    const handler = await getFunctionInfo(lambda, 'handlerFile')
                    const lambdaLocation = path.join(workspacePath, handler)
                    await openLambdaFile(lambdaLocation, vscode.ViewColumn.One)
                } catch (e) {
                    void vscode.window.showWarningMessage(
                        localize('AWS.lambda.openFile.failure', `Failed to determine handler location: ${e}`)
                    )
                }

                // Check if there are changes that need overwritten
                try {
                    // Checking if there are changes that need to be overwritten
                    const prompt = localize(
                        'AWS.lambda.download.confirmOutdatedSync',
                        'There are changes to your function in the cloud since you last edited locally, do you want to overwrite your local changes?'
                    )

                    // Adding delay to give the authentication time to catch up
                    await new Promise((resolve) => globals.clock.setTimeout(resolve, 1000))

                    const overwriteChanges = !(await compareCodeSha(lambda))
                        ? await confirmOutdatedChanges(prompt)
                        : false
                    if (overwriteChanges) {
                        // Close all open tabs from this workspace
                        const workspaceUri = vscode.Uri.file(workspacePath)
                        for (const tabGroup of vscode.window.tabGroups.all) {
                            const tabsToClose = tabGroup.tabs.filter(
                                (tab) =>
                                    tab.input instanceof vscode.TabInputText &&
                                    tab.input.uri.fsPath.startsWith(workspaceUri.fsPath)
                            )
                            if (tabsToClose.length > 0) {
                                await vscode.window.tabGroups.close(tabsToClose)
                            }
                        }

                        // Delete all files in the directory
                        await deleteFilesInFolder(workspacePath)

                        // Show message to user about next steps
                        void vscode.window.showInformationMessage(
                            localize(
                                'AWS.lambda.refresh.complete',
                                'Local workspace cleared. Navigate to the Toolkit explorer to get fresh code from the cloud.'
                            )
                        )

                        await setFunctionInfo(lambda, { undeployed: false })

                        // Remove workspace folder
                        const workspaceIndex = vscode.workspace.workspaceFolders?.findIndex(
                            (folder) => folder.uri.fsPath.toLowerCase() === workspacePath
                        )
                        if (workspaceIndex !== undefined && workspaceIndex >= 0) {
                            vscode.workspace.updateWorkspaceFolders(workspaceIndex, 1)
                        }
                    }
                } catch (e) {
                    void vscode.window.showWarningMessage(
                        localize(
                            'AWS.lambda.pull.failure',
                            `Failed to pull latest changes from the cloud, you can still edit locally: ${e}`
                        )
                    )
                }
            }
        }
    }
}

/**
 * Activates Lambda components.
 */
export async function activate(context: ExtContext): Promise<void> {
    void quickEditActivation()

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

    void activateRemoteDebugging()
}
