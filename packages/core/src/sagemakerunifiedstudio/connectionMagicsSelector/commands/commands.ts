/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { connectionOptionsService } from '../services/connectionOptionsService'
import { notebookStateManager } from '../services/notebookStateManager'
import {
    ConnectionStatusBarProvider,
    ProjectStatusBarProvider,
    SeparatorStatusBarProvider,
} from '../providers/notebookStatusBarProviders'
import { Constants } from '../models/constants'

let connectionProvider: ConnectionStatusBarProvider | undefined
let projectProvider: ProjectStatusBarProvider | undefined
let separatorProvider: SeparatorStatusBarProvider | undefined

/**
 * Gets the status bar providers for registration, auto-initializing if needed
 */
export function getStatusBarProviders(): {
    connectionProvider: ConnectionStatusBarProvider
    projectProvider: ProjectStatusBarProvider
    separatorProvider: SeparatorStatusBarProvider
} {
    if (!connectionProvider) {
        connectionProvider = new ConnectionStatusBarProvider(3, Constants.CONNECTION_COMMAND)
    }
    if (!projectProvider) {
        projectProvider = new ProjectStatusBarProvider(2, Constants.PROJECT_COMMAND)
    }
    if (!separatorProvider) {
        separatorProvider = new SeparatorStatusBarProvider(1)
    }

    return {
        connectionProvider,
        projectProvider,
        separatorProvider,
    }
}

/**
 * Sets the selected connection for a cell and updates the magic command
 */
export async function setSelectedConnection(cell: vscode.NotebookCell, connectionLabel: string): Promise<void> {
    notebookStateManager.setSelectedConnection(cell, connectionLabel, true)
    await notebookStateManager.updateCellWithMagic(cell)
}

/**
 * Sets the selected project for a cell and updates the magic command
 */
export async function setSelectedProject(cell: vscode.NotebookCell, projectLabel: string): Promise<void> {
    notebookStateManager.setSelectedProject(cell, projectLabel)
    await notebookStateManager.updateCellWithMagic(cell)
}

/**
 * Shows a quick pick menu for selecting a connection type and sets the connection for the active cell
 */
export async function showConnectionQuickPick(): Promise<void> {
    const editor = vscode.window.activeNotebookEditor
    if (!editor) {
        return
    }

    const cell = editor.selection.start !== undefined ? editor.notebook.cellAt(editor.selection.start) : undefined
    if (!cell) {
        return
    }

    await connectionOptionsService.updateConnectionAndProjectOptions()

    const connectionOptions = connectionOptionsService.getConnectionOptionsSync()

    // Sort connections based on preferred connection order
    const sortedOptions = connectionOptions.sort((a, b) => {
        // Comparison logic
        const aIndex = Constants.CONNECTION_QUICK_PICK_ORDER.indexOf(a.label as any)
        const bIndex = Constants.CONNECTION_QUICK_PICK_ORDER.indexOf(b.label as any)

        // If both are in the priority list, sort by their position
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex
        }
        // If only 'a' is in the priority list, it comes first
        if (aIndex !== -1) {
            return -1
        }
        // If only 'b' is in the priority list, it comes first
        if (bIndex !== -1) {
            return 1
        }
        // If neither is in the priority list, maintain original order
        return 0
    })

    const quickPickItems: vscode.QuickPickItem[] = sortedOptions.map((option) => {
        return {
            label: option.label,
            description: `(${option.magic})`,
            iconPath: new vscode.ThemeIcon('plug'),
        }
    })

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: Constants.CONNECTION_QUICK_PICK_LABEL_PLACEHOLDER,
    })

    if (selected) {
        const connectionLabel = selected.detail || selected.label
        await setSelectedConnection(cell, connectionLabel)
    }
}

/**
 * Shows a quick pick menu for selecting a project type and sets the project for the active cell
 */
export async function showProjectQuickPick(): Promise<void> {
    const editor = vscode.window.activeNotebookEditor
    if (!editor) {
        return
    }

    const cell = editor.selection.start !== undefined ? editor.notebook.cellAt(editor.selection.start) : undefined
    if (!cell) {
        return
    }

    const connection = notebookStateManager.getSelectedConnection(cell)
    if (!connection) {
        return
    }

    await connectionOptionsService.updateConnectionAndProjectOptions()

    const options = notebookStateManager.getProjectOptionsForConnection(cell)
    if (options.length === 0) {
        return
    }

    const projectQuickPickItems: vscode.QuickPickItem[] = options.map((option) => {
        return {
            label: option.project,
            description: `(${option.connection})`,
            iconPath: new vscode.ThemeIcon('server'),
        }
    })

    const selected = await vscode.window.showQuickPick(projectQuickPickItems, {
        placeHolder: Constants.PROJECT_QUICK_PICK_LABEL_PLACEHOLDER,
    })

    if (selected) {
        if (!selected.label) {
            return
        }

        await setSelectedProject(cell, selected.label)
    }
}

/**
 * Refreshes the status bar items
 */
export function refreshStatusBarItems(): void {
    connectionProvider?.refreshCellStatusBar()
    projectProvider?.refreshCellStatusBar()
    separatorProvider?.refreshCellStatusBar()
}

/**
 * Parses all notebook cells to current cell magics
 */
export async function parseNotebookCells(): Promise<void> {
    await connectionOptionsService.updateConnectionAndProjectOptions()

    const editor = vscode.window.activeNotebookEditor
    if (!editor) {
        return
    }

    for (let i = 0; i < editor.notebook.cellCount; i++) {
        const cell = editor.notebook.cellAt(i)

        if (cell.kind === vscode.NotebookCellKind.Code && cell.document.languageId !== 'markdown') {
            notebookStateManager.parseCellMagic(cell)
        }
    }

    refreshStatusBarItems()
}
