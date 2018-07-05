'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../shared/nodes';
import { ApplicationsNode } from './explorer/applicationsNode';
import { GuidesNode } from './explorer/guidesNode';
import { ConstructsNode } from './explorer/constructsNode';

export class CdkProvider implements vscode.TreeDataProvider<ExplorerNodeBase> {

    onDidChangeTreeData?: vscode.Event<any> | undefined;

    rootNodes: ExplorerNodeBase[] = [
        new ApplicationsNode(),
        new GuidesNode(),
        new ConstructsNode()
    ];

    getTreeItem(element: any): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    getChildren(element?: any): vscode.ProviderResult<any[]> {
        if (element) {
            return element.getChildren();
        }

        return this.rootNodes;
    }

    constructor() {
    }

}

