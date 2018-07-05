'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ExplorerNodeBase } from '../../shared/nodes';

export class ConstructNode extends ExplorerNodeBase {

    constructor(
        public readonly constructName: string,
    ) {
        super();
    }

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
       return [];
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(`${this.constructName}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'light', 'cdk_construct.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'dark', 'cdk_construct.svg')
        };

        return item;
    }
}

