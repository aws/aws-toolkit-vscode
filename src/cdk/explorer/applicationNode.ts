'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ExplorerNodeBase } from '../../shared/nodes';

export class ApplicationNode extends ExplorerNodeBase {
    constructor(
        public readonly applicationNode: string
    ) {
		super();
    }

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(this.applicationNode, vscode.TreeItemCollapsibleState.None);
        item.tooltip = `${this.applicationNode}`;
        item.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'light', 'cdk_application.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'dark', 'cdk_application.svg')
        };

        return item;
    }
}
