/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Constants } from './models/constants'
import {
    getStatusBarProviders,
    showConnectionQuickPick,
    showProjectQuickPick,
    parseNotebookCells,
} from './commands/commands'

/**
 * Activates the SageMaker Unified Studio Connection Magics Selector feature.
 *
 * @param extensionContext The extension context
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(
        vscode.commands.registerCommand(Constants.CONNECTION_COMMAND, () => showConnectionQuickPick()),
        vscode.commands.registerCommand(Constants.PROJECT_COMMAND, () => showProjectQuickPick())
    )

    if ('NotebookEdit' in vscode) {
        const { connectionProvider, projectProvider, separatorProvider } = getStatusBarProviders()

        extensionContext.subscriptions.push(
            vscode.notebooks.registerNotebookCellStatusBarItemProvider('jupyter-notebook', connectionProvider),
            vscode.notebooks.registerNotebookCellStatusBarItemProvider('jupyter-notebook', projectProvider),
            vscode.notebooks.registerNotebookCellStatusBarItemProvider('jupyter-notebook', separatorProvider)
        )

        extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveNotebookEditor(async () => {
                await parseNotebookCells()
            })
        )

        extensionContext.subscriptions.push(vscode.workspace.onDidChangeTextDocument(handleTextDocumentChange))

        void parseNotebookCells()
    }
}

/**
 * Handles text document changes to update status bar when cells are manually edited
 */
function handleTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.document.uri.scheme !== 'vscode-notebook-cell') {
        return
    }

    const editor = vscode.window.activeNotebookEditor
    if (!editor) {
        return
    }

    let changedCell: vscode.NotebookCell | undefined
    for (let i = 0; i < editor.notebook.cellCount; i++) {
        const cell = editor.notebook.cellAt(i)
        if (cell.document.uri.toString() === event.document.uri.toString()) {
            changedCell = cell
            break
        }
    }

    if (changedCell && changedCell.kind === vscode.NotebookCellKind.Code) {
        const { notebookStateManager } = require('./services/notebookStateManager')

        notebookStateManager.parseCellMagic(changedCell)

        setTimeout(() => {
            const { connectionProvider, projectProvider } = getStatusBarProviders()
            connectionProvider.refreshCellStatusBar()
            projectProvider.refreshCellStatusBar()
        }, 100)
    }
}
