'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase, IRefreshableAWSTreeProvider } from '../shared/nodes';
import { FunctionsNode } from './explorer/functionsNode';
import { GuidesNode } from './explorer/guidesNode';
import { ProjectBlueprintsNode } from './explorer/projectBlueprintsNode';
import { FunctionNode } from './explorer/functionNode';
import { getLambdaPolicy } from './commands/getLambdaPolicy';
import { invokeLambda } from './commands/invokeLambda';
import { getLambdaConfig } from './commands/getLambdaConfig';
import { AWSContext } from '../shared/awsContext';
import { ext } from '../shared/extensionGlobals';

export class LambdaProvider implements vscode.TreeDataProvider<ExplorerNodeBase>, IRefreshableAWSTreeProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<FunctionNode | undefined> = new vscode.EventEmitter<FunctionNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FunctionNode | undefined> = this._onDidChangeTreeData.event;

    public viewProviderId: string = 'lambda';

    public initialize(): void {
        vscode.commands.registerCommand('aws.invokeLambda', async (node: FunctionNode) => await invokeLambda(node));
        vscode.commands.registerCommand('aws.getLambdaConfig', async (node: FunctionNode) => await getLambdaConfig(node));
        vscode.commands.registerCommand('aws.getLambdaPolicy', async (node: FunctionNode) => await getLambdaPolicy(node));

        ext.treesToRefreshOnContextChange.push(this);
    }

    rootNodes: ExplorerNodeBase[] = [
        new FunctionsNode(),
        new GuidesNode(),
        new ProjectBlueprintsNode()
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

