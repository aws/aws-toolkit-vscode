'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase, IRefreshTreeProvider } from '../shared/nodes';
import { FunctionsNode } from './explorer/functionsNode';
import { GuidesNode } from './explorer/guidesNode';
import { BlueprintsNode } from './explorer/blueprintsNode';
import { FunctionNode } from './explorer/functionNode';
import { AWSContext } from '../shared/awsContext';

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

    refresh(context: AWSContext) {
        this._onDidChangeTreeData.fire();
    }

    constructor() {
    }
}

