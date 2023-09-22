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
import { ConnectionParams } from './models/models'
import { DefaultRedshiftClient } from '../shared/clients/redshiftClient'
import { localize } from '../shared/utilities/vsCodeUtils'
import { SystemUtilities } from '../shared/systemUtilities'
import * as fs from 'fs-extra'
import { RedshiftWarehouseNode } from './explorer/redshiftWarehouseNode'

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
        const commandHandler = async (cell: vscode.NotebookCell, refreshCellStatusBar: () => void) => {
            const warehouseConnectionWizard = new NotebookConnectionWizard(ctx.regionProvider)
            let connectionParams: ConnectionParams | undefined = await warehouseConnectionWizard.run()
            if (!connectionParams) {
                return
            }
            redshiftNotebookController.redshiftClient = new DefaultRedshiftClient(connectionParams.region!.id)
            try {
                await redshiftNotebookController.redshiftClient.listDatabases(connectionParams!)
                outputChannel.appendLine(`Redshift: connected to: ${connectionParams.warehouseIdentifier}`)
            } catch (error) {
                outputChannel.appendLine(
                    `Redshift: failed to connect to: ${connectionParams.warehouseIdentifier} - ${
                        (error as Error).message
                    }`
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
        ctx.extensionContext.subscriptions.push(Commands.register('aws.redshift.connectClicked', commandHandler))

        const startHandler = async (parentNode: RedshiftWarehouseNode) => {
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
                    await fs.writeFile(
                        selectedUri.fsPath,
                        `{"cells":[{"kind":2,"language":"sql","value":"","metadata":{"connectionParams":${JSON.stringify(
                            parentNode.connectionParams
                        )}}}]}`
                    )
                    const region = JSON.stringify(parentNode.connectionParams?.region)
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
        ctx.extensionContext.subscriptions.push(Commands.register('aws.redshift.startButtonClicked', startHandler))
    }
}
