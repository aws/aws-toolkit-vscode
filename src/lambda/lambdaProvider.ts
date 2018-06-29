'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase, IRefreshTreeProvider } from '../shared/nodes';
import { FunctionsNode } from './functionsNode';
import { GuidesNode } from './guidesNode';
import { BlueprintsNode } from './blueprintsNode';
import { FunctionNode } from './functionNode';

export class LambdaProvider implements vscode.TreeDataProvider<ExplorerNodeBase>, IRefreshTreeProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<FunctionNode | undefined> = new vscode.EventEmitter<FunctionNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FunctionNode | undefined> = this._onDidChangeTreeData.event;

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

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    constructor() {
    }
}

