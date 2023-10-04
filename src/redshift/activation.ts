/* eslint-disable header/header */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtContext } from '../shared/extensions'
import * as vscode from 'vscode'
import { RedshiftNotebookSerializer } from './notebook/redshiftNotebookSerializer'
import { RedshiftNotebookController } from './notebook/redshiftNotebookController'
import { CellStatusBarItemProvider } from './notebook/cellStatusBarItemProvider'
import { Commands } from '../shared/vscode/commands2'
import { NotebookConnectionWizard } from './wizards/connectionWizard'
import { ConnectionParams, ConnectionType } from './models/models'
import { DefaultRedshiftClient } from '../shared/clients/redshiftClient'
import { localize } from '../shared/utilities/vsCodeUtils'
import { SystemUtilities } from '../shared/systemUtilities'
import { FileSystemCommon } from '../srcShared/fs'
import { RedshiftWarehouseNode } from './explorer/redshiftWarehouseNode'
import { ToolkitError } from '../shared/errors'
import { deleteConnection, updateConnectionParamsState } from './explorer/redshiftState'

export async function activate(ctx: ExtContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('Redshift Connection')
    outputChannel.show(true)

    if ('NotebookEdit' in vscode) {
        ctx.extensionContext.subscriptions.push(
            vscode.workspace.registerNotebookSerializer('aws-redshift-sql-notebook', new RedshiftNotebookSerializer())
        )
        vscode.notebooks.registerNotebookCellStatusBarItemProvider(
            'aws-redshift-sql-notebook',
            new CellStatusBarItemProvider()
        )
        const redshiftNotebookController = new RedshiftNotebookController()
        ctx.extensionContext.subscriptions.push(
            Commands.register(
                'aws.redshift.notebookConnectClicked',
                getNotebookConnectClickedHandler(ctx, redshiftNotebookController, outputChannel)
            )
        )

        ctx.extensionContext.subscriptions.push(
            Commands.register(
                'aws.redshift.createNotebookClicked',
                getCreateNotebookClickedHandler(redshiftNotebookController)
            )
        )

        ctx.extensionContext.subscriptions.push(
            Commands.register('aws.redshift.editConnection', getEditConnectionHandler(outputChannel))
        )

        ctx.extensionContext.subscriptions.push(
            Commands.register('aws.redshift.deleteConnection', getDeleteConnectionHandler())
        )
    }
}

function getCreateNotebookClickedHandler(redshiftNotebookController: RedshiftNotebookController) {
    return async (parentNode: RedshiftWarehouseNode) => {
        const workspaceDir = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri
            : vscode.Uri.file(SystemUtilities.getHomeDirectory())
        const selectedUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(workspaceDir),
            filters: {
                ['Redshift SQL Notebook']: ['.redshiftnb'],
            },
        })

        if (selectedUri) {
            try {
                await FileSystemCommon.instance.writeFile(
                    selectedUri.fsPath,
                    `{"cells":[{"kind":2,"language":"sql","value":"","metadata":{"connectionParams":${JSON.stringify(
                        parentNode.connectionParams
                    )}}}]}`
                )
                const region = parentNode.redshiftClient.regionCode
                await (vscode.window as any).showNotebookDocument({ uri: selectedUri } as vscode.NotebookDocument)
                redshiftNotebookController.redshiftClient = new DefaultRedshiftClient(region)

                // TODO: Open file and close virtual doc? Is this possible?
            } catch (e) {
                const err = e as Error
                vscode.window.showErrorMessage(
                    localize(
                        'AWS.command.saveCurrentLogDataContent.error',
                        'Error saving current log to {0}: {1}',
                        selectedUri.fsPath,
                        err.message
                    )
                )
            }
        }
    }
}

function getNotebookConnectClickedHandler(
    ctx: ExtContext,
    redshiftNotebookController: RedshiftNotebookController,
    outputChannel: vscode.OutputChannel
) {
    return async (cell: vscode.NotebookCell, refreshCellStatusBar: () => void) => {
        const warehouseConnectionWizard = new NotebookConnectionWizard(ctx.regionProvider)
        let connectionParams: ConnectionParams | undefined = await warehouseConnectionWizard.run()
        if (!connectionParams) {
            return
        }
        redshiftNotebookController.redshiftClient = new DefaultRedshiftClient(connectionParams.region!.id)
        try {
            const redshiftClient = (redshiftNotebookController.redshiftClient = new DefaultRedshiftClient(
                connectionParams.region!.id
            ))
            if (connectionParams.connectionType === ConnectionType.DatabaseUser) {
                const secretArnFetched = await redshiftClient.createSecretFromConnectionParams(connectionParams)
                if (!secretArnFetched) {
                    throw new ToolkitError('secret arn could not be fetched')
                }
                connectionParams.secret = secretArnFetched
            }
            await redshiftNotebookController.redshiftClient.listDatabases(connectionParams!)
            outputChannel.appendLine(`Redshift: connected to: ${connectionParams.warehouseIdentifier}`)
        } catch (error) {
            outputChannel.appendLine(
                `Redshift: failed to connect to: ${connectionParams.warehouseIdentifier} - ${(error as Error).message}`
            )
            connectionParams = undefined
        }
        const edit = new vscode.WorkspaceEdit()
        //NotebookEdit is  only available for engine version > 1.68.0
        const nbEdit = (vscode as any).NotebookEdit.updateNotebookMetadata({
            connectionParams: connectionParams,
        })
        edit.set(cell.notebook.uri, [nbEdit])
        await vscode.workspace.applyEdit(edit)
        refreshCellStatusBar()
    }
}

function getEditConnectionHandler(outputChannel: vscode.OutputChannel) {
    return async (redshiftWarehouseNode: RedshiftWarehouseNode) => {
        try {
            const connectionParams = await redshiftWarehouseNode.connectionWizard!.run()
            if (connectionParams) {
                if (connectionParams.connectionType === ConnectionType.DatabaseUser) {
                    const secretArnFetched =
                        await redshiftWarehouseNode.redshiftClient.createSecretFromConnectionParams(connectionParams)
                    if (!secretArnFetched) {
                        throw new Error('secret arn could not be fetched')
                    }
                    connectionParams.secret = secretArnFetched
                }
                await redshiftWarehouseNode.redshiftClient.listDatabases(connectionParams!)
                redshiftWarehouseNode.setConnectionParams(connectionParams)
                await updateConnectionParamsState(redshiftWarehouseNode.arn, redshiftWarehouseNode.connectionParams)
            }
        } catch (error) {
            outputChannel.appendLine(
                `Redshift: the new credentials failed: ${redshiftWarehouseNode.name} - ${(error as Error).message}`
            )
        }
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', redshiftWarehouseNode)
    }
}

function getDeleteConnectionHandler() {
    return async (redshiftWarehouseNode: RedshiftWarehouseNode) => {
        redshiftWarehouseNode.connectionParams = undefined
        await updateConnectionParamsState(redshiftWarehouseNode.arn, deleteConnection)
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', redshiftWarehouseNode)
    }
}
