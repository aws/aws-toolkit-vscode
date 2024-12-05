/* eslint-disable header/header */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { ConnectionParams } from '../models/models'
import { RedshiftData } from 'aws-sdk'
import { telemetry } from '../../../shared/telemetry/telemetry'

export class RedshiftNotebookController {
    readonly id = 'aws-redshift-sql-notebook'
    public readonly label = 'Redshift SQL notebook'
    readonly supportedLanguages = ['sql']

    private _executionOrder = 0
    private readonly _controller: vscode.NotebookController

    constructor(public redshiftClient?: DefaultRedshiftClient) {
        this._controller = vscode.notebooks.createNotebookController(this.id, 'aws-redshift-sql-notebook', this.label)
        this._controller.supportedLanguages = this.supportedLanguages
        this._controller.supportsExecutionOrder = true
        this._controller.executeHandler = this._executeAll.bind(this)
    }

    dispose(): void {
        this._controller.dispose()
    }

    private async _executeAll(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            await this._doExecution(cell)
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        const execution = this._controller.createNotebookCellExecution(cell)
        execution.executionOrder = ++this._executionOrder
        execution.start(Date.now())
        let success = false
        try {
            // Used  Promise.race to handle both execution and cancellation
            const resultPromise = this.executeCell(cell)
            const cancellationPromise = new Promise<vscode.NotebookCellOutput>((_, reject) => {
                execution.token.onCancellationRequested(() => {
                    reject(new Error('Cell execution was cancelled.'))
                })
            })
            const cellOutput = await Promise.race([resultPromise, cancellationPromise])
            success = true
            await execution.replaceOutput([cellOutput])
        } catch (err: unknown) {
            await execution.replaceOutput([
                new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.error(err as Error)]),
            ])
            success = false
        } finally {
            execution.end(success, Date.now())
        }
    }

    private async executeCell(cell: vscode.NotebookCell): Promise<vscode.NotebookCellOutput> {
        return telemetry.redshift_executeQuery.run(async () => {
            const connectionParams = cell.notebook.metadata?.connectionParams as ConnectionParams
            // check cell connection before execute the query
            if (connectionParams === undefined) {
                throw Error('This cell is not connected to any cluster or workgroup.')
            }

            // This handles cases where the users had connected to the database with the wizard in a previous session and they opened and closed the editor
            if (!this.redshiftClient && connectionParams) {
                this.redshiftClient = new DefaultRedshiftClient(connectionParams.region!.id)
            }

            let executionId: string | undefined
            let columnMetadata: RedshiftData.ColumnMetadataList | undefined
            const records: RedshiftData.SqlRecords = []
            let nextToken: string | undefined
            // get all the pages of the result
            do {
                const result = await this.redshiftClient!.executeQuery(
                    connectionParams,
                    cell.document.getText(),
                    nextToken,
                    executionId
                )
                if (result) {
                    nextToken = result.statementResultResponse.NextToken
                    executionId = result.executionId
                    columnMetadata = result.statementResultResponse.ColumnMetadata
                    records.push(...result.statementResultResponse.Records)
                } else {
                    return new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.text('Query completed — No rows returned.', 'text/plain'),
                    ])
                }
            } while (nextToken)

            if (columnMetadata) {
                const columnNames: string[] = columnMetadata.map((column) => column.name || 'UnknownColumnName')
                if (columnNames) {
                    const htmlTable = this.getAsTable(connectionParams, columnNames, records)
                    return new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(htmlTable, 'text/html')])
                } else {
                    throw Error('Column metadata did not contain column names')
                }
            } else {
                throw Error('Result did not contain column metadata')
            }
        })
    }

    public getAsTable(connectionParams: ConnectionParams, columns: string[], records: RedshiftData.SqlRecords) {
        if (!records || records.length === 0) {
            return '<p>No records to display<p>'
        }
        let tableHtml = `<p>Results from ${connectionParams.warehouseIdentifier} - database: ${connectionParams.database}</p><table><thead><tr>`

        // Adding column headers
        for (const column of columns) {
            tableHtml += `<th>${column}</th>`
        }
        tableHtml += '</tr></thead><tbody>'

        // Adding data rows
        for (const row of records) {
            tableHtml += '<tr>'
            for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
                let cellValue: undefined
                if (Object.keys(row[columnIndex])[0] !== 'isNull') {
                    cellValue = Object.values(row[columnIndex])[0]
                }
                tableHtml += `<td>${cellValue}</td>`
            }
            tableHtml += '<tr>'
        }
        tableHtml += '</tbody></table>'
        return tableHtml
    }
}
