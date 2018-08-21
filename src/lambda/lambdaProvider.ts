'use strict';

import * as vscode from 'vscode';
import { AWSTreeNodeBase } from '../shared/awsTreeNodeBase';
import { IRefreshableAWSTreeProvider } from '../shared/IAWSTreeProvider';
import { FunctionsNode } from './explorer/functionsNode';
import { GuidesNode } from './explorer/guidesNode';
import { ProjectBlueprintsNode } from './explorer/projectBlueprintsNode';
import { FunctionNode } from './explorer/functionNode';
import { getLambdaPolicy } from './commands/getLambdaPolicy';
import { invokeLambda } from './commands/invokeLambda';
import { newLambda } from './commands/newLambda';
import { deployLambda }from './commands/deployLambda';
import { getLambdaConfig } from './commands/getLambdaConfig';
import { AWSContext } from '../shared/awsContext';
import { ext } from '../shared/extensionGlobals';

export class LambdaProvider implements vscode.TreeDataProvider<AWSTreeNodeBase>, IRefreshableAWSTreeProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<FunctionNode | undefined> = new vscode.EventEmitter<FunctionNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FunctionNode | undefined> = this._onDidChangeTreeData.event;

    public viewProviderId: string = 'lambda';

    public initialize(): void {
        vscode.commands.registerCommand('aws.newLambda', async () => await newLambda());
        vscode.commands.registerCommand('aws.deployLambda', async (node: FunctionNode) => await deployLambda(node));
        vscode.commands.registerCommand('aws.invokeLambda', async (node: FunctionNode) => await invokeLambda(node));
        vscode.commands.registerCommand('aws.getLambdaConfig', async (node: FunctionNode) => await getLambdaConfig(node));
        vscode.commands.registerCommand('aws.getLambdaPolicy', async (node: FunctionNode) => await getLambdaPolicy(node));

        ext.treesToRefreshOnContextChange.push(this);
    }

    rootNodes: AWSTreeNodeBase[] = [
        new FunctionsNode(),
        new GuidesNode(),
        new ProjectBlueprintsNode()
    ];

    getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element.getTreeItem();
    }

    getChildren(element?: AWSTreeNodeBase): Thenable<AWSTreeNodeBase[]> {
        if (element) {
            return element.getChildren();
        }

        return new Promise(resolve => resolve(this.rootNodes));
    }

    refresh(context?: AWSContext) {
        this._onDidChangeTreeData.fire();
    }

    constructor() {
    }
}

