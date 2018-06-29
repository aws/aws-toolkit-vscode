'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../shared/nodes';

export class BlueprintsNode extends ExplorerNodeBase {

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return [
        ];
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Project Blueprints', vscode.TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'Blueprints for creating new projects targeting AWS Lambda';

        return item;
    }
}
