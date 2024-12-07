/* eslint-disable header/header */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtContext } from '../../shared/extensions'
import * as vscode from 'vscode'
import { RedshiftNotebookSerializer } from './notebook/redshiftNotebookSerializer'
import { RedshiftNotebookController } from './notebook/redshiftNotebookController'
import { CellStatusBarItemProvider } from './notebook/cellStatusBarItemProvider'
import { Commands } from '../../shared/vscode/commands2'
import { NotebookConnectionWizard, RedshiftNodeConnectionWizard } from './wizards/connectionWizard'
import { deleteConnection, ConnectionParams, ConnectionType } from './models/models'
import { DefaultRedshiftClient } from '../../shared/clients/redshiftClient'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { RedshiftWarehouseNode } from './explorer/redshiftWarehouseNode'
import { ToolkitError } from '../../shared/errors'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { showConnectionMessage } from './messageUtils'
import globals from '../../shared/extensionGlobals'

export async function activate(ctx: ExtContext): Promise<void> {
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
                getNotebookConnectClickedHandler(ctx, redshiftNotebookController)
            )
        )

        ctx.extensionContext.subscriptions.push(
            Commands.register(
                'aws.redshift.createNotebookClicked',
                getCreateNotebookClickedHandler(redshiftNotebookController)
            )
        )

        ctx.extensionContext.subscriptions.push(
            Commands.register('aws.redshift.editConnection', getEditConnectionHandler())
        )

        ctx.extensionContext.subscriptions.push(
            Commands.register('aws.redshift.deleteConnection', getDeleteConnectionHandler())
        )
    }
}

function getCreateNotebookClickedHandler(redshiftNotebookController: RedshiftNotebookController) {
    return async (parentNode: RedshiftWarehouseNode) => {
        try {
            const region = parentNode.redshiftClient.regionCode
            const celldata = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'sql')
            celldata.metadata = { connectionParams: parentNode.connectionParams }
            const nbdata = new vscode.NotebookData([celldata])
            nbdata.metadata = { connectionParams: parentNode.connectionParams }
            const nbdoc = await vscode.workspace.openNotebookDocument('aws-redshift-sql-notebook', nbdata)
            await (vscode.window as any).showNotebookDocument(nbdoc)
            redshiftNotebookController.redshiftClient = new DefaultRedshiftClient(region)
        } catch (e) {
            const err = e as Error
            void showViewLogsMessage(
                localize('AWS.command.notebook.fail', 'Failed to create notebook: {0}', err.message)
            )
        }
    }
}

function getNotebookConnectClickedHandler(ctx: ExtContext, redshiftNotebookController: RedshiftNotebookController) {
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
            showConnectionMessage(connectionParams.warehouseIdentifier, undefined)
        } catch (error) {
            showConnectionMessage(connectionParams.warehouseIdentifier, error as Error)
            connectionParams = undefined
        }
        const edit = new vscode.WorkspaceEdit()
        // NotebookEdit is  only available for engine version > 1.68.0
        const nbEdit = (vscode as any).NotebookEdit.updateNotebookMetadata({
            connectionParams: connectionParams,
        })
        edit.set(cell.notebook.uri, [nbEdit])
        await vscode.workspace.applyEdit(edit)
        refreshCellStatusBar()
    }
}

function getEditConnectionHandler() {
    return async (redshiftWarehouseNode: RedshiftWarehouseNode) => {
        try {
            const connectionParams = await new RedshiftNodeConnectionWizard(redshiftWarehouseNode).run()
            if (connectionParams) {
                if (connectionParams.connectionType === ConnectionType.DatabaseUser) {
                    const secretArnFetched =
                        await redshiftWarehouseNode.redshiftClient.createSecretFromConnectionParams(connectionParams)
                    if (!secretArnFetched) {
                        throw new Error('secret arn could not be fetched')
                    }
                    connectionParams.secret = secretArnFetched
                }
                redshiftWarehouseNode.setConnectionParams(connectionParams)
                await globals.globalState.saveRedshiftConnection(
                    redshiftWarehouseNode.arn,
                    redshiftWarehouseNode.connectionParams
                )
                await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', redshiftWarehouseNode)
            }
        } catch (error) {
            showConnectionMessage(redshiftWarehouseNode.name, error as Error)
        }
    }
}

function getDeleteConnectionHandler() {
    return async (redshiftWarehouseNode: RedshiftWarehouseNode) => {
        redshiftWarehouseNode.connectionParams = undefined
        await globals.globalState.saveRedshiftConnection(redshiftWarehouseNode.arn, deleteConnection)
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', redshiftWarehouseNode)
    }
}
