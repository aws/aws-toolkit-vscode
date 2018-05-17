'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../shared/explorerNodeBase';
import { ConstructNode } from './constructNode';

export class ServiceConstructsNode extends ExplorerNodeBase {

    constructor(
        public readonly serviceName: string,
        public readonly serviceFullname: string,
        public readonly constructs: ConstructNode[]
    ) {
        super();
    }

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return this.constructs;
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(this.serviceName, vscode.TreeItemCollapsibleState.Expanded);
        item.tooltip = `Constructs for ${this.serviceFullname}`;

        return item;
    }
}

