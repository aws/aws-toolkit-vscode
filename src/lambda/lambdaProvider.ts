'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../shared/explorerNodeBase';
import { FunctionsNode } from './functionsNode';
import { GuidesNode } from './guidesNode';
import { BlueprintsNode } from './blueprintsNode';

export class LambdaProvider implements vscode.TreeDataProvider<ExplorerNodeBase> {

    onDidChangeTreeData?: vscode.Event<any> | undefined;

    rootNodes: ExplorerNodeBase[] = [
        new FunctionsNode(),
        new GuidesNode(),
        new BlueprintsNode()
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

