/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { notebookStateManager } from '../services/notebookStateManager'
import { Constants } from '../models/constants'

/**
 * Abstract base class for notebook status bar providers.
 */
export abstract class BaseNotebookStatusBarProvider implements vscode.NotebookCellStatusBarItemProvider {
    protected item: vscode.NotebookCellStatusBarItem
    protected onDidChangeCellStatusBarItemsEmitter = new vscode.EventEmitter<void>()
    protected priority: number
    protected icon?: string
    protected command?: string
    protected tooltip?: string

    public constructor(priority: number, icon?: string, command?: string, tooltip?: string) {
        this.priority = priority
        this.icon = icon
        this.command = command
        this.tooltip = tooltip
        this.item = new vscode.NotebookCellStatusBarItem('', vscode.NotebookCellStatusBarAlignment.Right)
        this.item.priority = priority
    }

    /**
     * Abstract method that each provider must implement to provide their specific status bar item.
     */
    public abstract provideCellStatusBarItems(
        cell: vscode.NotebookCell,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.NotebookCellStatusBarItem | vscode.NotebookCellStatusBarItem[]>

    /**
     * Creates a status bar item with the provided text and applies common settings.
     */
    protected createStatusBarItem(text: string, isClickable: boolean = true): vscode.NotebookCellStatusBarItem {
        const displayText = this.icon ? `${this.icon} ${text}` : text
        const item = new vscode.NotebookCellStatusBarItem(displayText, vscode.NotebookCellStatusBarAlignment.Right)
        item.priority = this.priority

        if (isClickable && this.command) {
            item.command = this.command
            item.tooltip = this.tooltip
        }

        return item
    }

    /**
     * Refreshes the cell status bar items.
     */
    public refreshCellStatusBar(): void {
        this.onDidChangeCellStatusBarItemsEmitter.fire()
    }

    /**
     * Event that fires when the cell status bar items have changed.
     */
    public get onDidChangeCellStatusBarItems(): vscode.Event<void> {
        return this.onDidChangeCellStatusBarItemsEmitter.event
    }
}

/**
 * Status bar provider for connection selection in notebook cells.
 */
export class ConnectionStatusBarProvider extends BaseNotebookStatusBarProvider {
    public constructor(priority: number, command: string) {
        super(priority, Constants.CONNECTION_STATUS_BAR_ITEM_ICON, command, Constants.CONNECTION_STATUS_BAR_ITEM_LABEL)
    }

    public provideCellStatusBarItems(
        cell: vscode.NotebookCell,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.NotebookCellStatusBarItem | vscode.NotebookCellStatusBarItem[]> {
        // Don't show on non-code or markdown code cells
        if (cell.kind !== vscode.NotebookCellKind.Code || cell.document.languageId === 'markdown') {
            return undefined
        }

        const connection = notebookStateManager.getSelectedConnection(cell)

        const displayText = connection || Constants.DEFAULT_CONNECTION_STATUS_BAR_ITEM_LABEL
        const item = this.createStatusBarItem(displayText)

        return item
    }
}

/**
 * Status bar provider for project selection in notebook cells.
 */
export class ProjectStatusBarProvider extends BaseNotebookStatusBarProvider {
    public constructor(priority: number, command: string) {
        super(priority, Constants.PROJECT_STATUS_BAR_ITEM_ICON, command, Constants.PROJECT_STATUS_BAR_ITEM_LABEL)
    }

    public provideCellStatusBarItems(
        cell: vscode.NotebookCell,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.NotebookCellStatusBarItem | vscode.NotebookCellStatusBarItem[]> {
        // Don't show on non-code or markdown code cells
        if (cell.kind !== vscode.NotebookCellKind.Code || cell.document.languageId === 'markdown') {
            return undefined
        }

        const project = notebookStateManager.getSelectedProject(cell)

        const displayText = project || Constants.DEFAULT_PROJECT_STATUS_BAR_ITEM_LABEL
        const item = this.createStatusBarItem(displayText)

        return item
    }
}

/**
 * Status bar provider for displaying a separator between items in notebook cells.
 */
export class SeparatorStatusBarProvider extends BaseNotebookStatusBarProvider {
    public constructor(priority: number, separatorText: string = '|') {
        super(priority)

        this.item = new vscode.NotebookCellStatusBarItem(separatorText, vscode.NotebookCellStatusBarAlignment.Right)
        this.item.priority = priority
    }

    public provideCellStatusBarItems(
        cell: vscode.NotebookCell,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.NotebookCellStatusBarItem | vscode.NotebookCellStatusBarItem[]> {
        // Don't show on non-code or markdown code cells
        if (cell.kind !== vscode.NotebookCellKind.Code || cell.document.languageId === 'markdown') {
            return undefined
        }

        return this.item
    }
}
