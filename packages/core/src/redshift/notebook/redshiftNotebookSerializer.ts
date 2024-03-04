/* eslint-disable header/header */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

interface RawNotebookData {
    cells: RawNotebookCell[]
}

interface RawNotebookCell {
    language: string
    value: string
    kind: vscode.NotebookCellKind
    metadata: { [key: string]: any }
    editable?: boolean
}

export class RedshiftNotebookSerializer implements vscode.NotebookSerializer {
    public readonly label: string = 'Redshift notebook serializer'

    public async deserializeNotebook(data: Uint8Array, token: vscode.CancellationToken): Promise<vscode.NotebookData> {
        const contents = new TextDecoder().decode(data) // convert to String to make JSON object

        // Read file contents
        let raw: RawNotebookData
        try {
            raw = JSON.parse(contents) as RawNotebookData
        } catch {
            raw = { cells: [] }
        }

        // Create array of Notebook cells for the VS Code API from file contents
        const metadata = raw.cells[0]?.metadata ?? {}
        const cells = raw.cells.map(item => {
            const newCell = new vscode.NotebookCellData(item.kind, item.value, item.language)
            return newCell
        })

        const notebookData = new vscode.NotebookData(cells)
        notebookData.metadata = metadata
        // Pass read and formatted Notebook Data to VS Code to display Notebook with saved cells
        return notebookData
    }

    public async serializeNotebook(
        notebookData: vscode.NotebookData,
        token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        // Map the Notebook data into the format we want to save the Notebook data as
        const contents: RawNotebookData = { cells: [] }

        for (const cell of notebookData.cells) {
            contents.cells.push({
                kind: cell.kind,
                language: cell.languageId,
                value: cell.value,
                metadata: notebookData.metadata ?? {},
            })
        }

        // Give a string of all the data to save and VS Code will handle the rest
        return new TextEncoder().encode(JSON.stringify(contents))
    }
}
