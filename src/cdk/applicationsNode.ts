'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../shared/explorerNodeBase';
import { ApplicationNode } from './applicationNode';

export class ApplicationsNode extends ExplorerNodeBase {

    rootNodes: ExplorerNodeBase[] = [
        new ApplicationNode('cdkApplication1'),
        new ApplicationNode('cdkApplication2')
    ];

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return this.rootNodes;
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Applications', vscode.TreeItemCollapsibleState.Expanded);
        item.tooltip = 'My deployed CDK applications';

        return item;
    }

}
