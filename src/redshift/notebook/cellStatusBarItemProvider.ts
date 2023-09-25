/* eslint-disable header/header */
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CancellationToken,
    NotebookCell,
    NotebookCellStatusBarAlignment,
    NotebookCellStatusBarItem,
    NotebookCellStatusBarItemProvider,
    ProviderResult,
    Command,
    EventEmitter,
} from 'vscode'
import { getIcon } from '../../shared/icons'

export class CellStatusBarItemProvider implements NotebookCellStatusBarItemProvider {
    private _item: NotebookCellStatusBarItem
    private _onDidChangeCellStatusBarItems = new EventEmitter<void>()
    onDidChangeCellStatusBarItems = this._onDidChangeCellStatusBarItems.event

    public constructor() {
        this._item = new NotebookCellStatusBarItem(
            `${getIcon('vscode-notebook-state-error')} Connect`,
            NotebookCellStatusBarAlignment.Right
        )
    }

    provideCellStatusBarItems(
        cell: NotebookCell,
        token: CancellationToken
    ): ProviderResult<NotebookCellStatusBarItem | NotebookCellStatusBarItem[]> {
        const metadata = cell.notebook.metadata
        if (metadata?.connectionParams) {
            this._item.text = `${getIcon('vscode-notebook-state-success')} Connected to ${
                metadata.connectionParams?.warehouseIdentifier
            }`
        } else {
            this._item.text = `${getIcon('vscode-notebook-state-error')} Connect`
        }
        this._item.command = {
            command: 'aws.redshift.notebookConnectClicked',
            arguments: [cell, this.refreshCellStatusBar.bind(this)],
        } as Command
        return [this._item]
    }

    refreshCellStatusBar() {
        this._onDidChangeCellStatusBarItems.fire()
    }
}
