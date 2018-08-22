'use strict';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

import * as vscode from 'vscode';
import { AWSTreeNodeBase } from '../shared/awsTreeNodeBase';
import { IRefreshableAWSTreeProvider } from '../shared/IAWSTreeProvider';
import { FunctionNode } from './explorer/functionNode';
import { getLambdaPolicy } from './commands/getLambdaPolicy';
import { invokeLambda } from './commands/invokeLambda';
import { newLambda } from './commands/newLambda';
import { deployLambda }from './commands/deployLambda';
import { getLambdaConfig } from './commands/getLambdaConfig';
import { AWSContext } from '../shared/awsContext';
import { ext } from '../shared/extensionGlobals';
import { AWSCommandTreeNode } from '../shared/awsCommandTreeNode';
import { RegionNodes } from './explorer/regionNodes';

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

    getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element.getTreeItem();
    }

    getChildren(element?: AWSTreeNodeBase): Thenable<AWSTreeNodeBase[]> {
        if (element) {
            return element.getChildren();
        }

        return new Promise(resolve => {
            const profileName = ext.awsContext.getCredentialProfileName();
            if (!profileName) {
                resolve([
                    new AWSCommandTreeNode(localize('AWS.explorerNode.signIn', 'Sign in to AWS...'),
                                           'aws.login',
                                           localize('AWS.explorerNode.signIn.tooltip', 'Connect to AWS using a credential profile'))
                ]);
            }

            ext.awsContext.getExplorerRegions().then(regions => {

                if (regions.length !== 0) {
                    let regionNodes: RegionNodes[] = [];

                    regions.forEach(r => {
                        regionNodes.push(new RegionNodes(r, r));
                    });

                    resolve(regionNodes);
                } else {
                    resolve([
                        new AWSCommandTreeNode(localize('AWS.explorerNode.addRegion', 'Click to add a region to view functions...'),
                                               'aws.addExplorerRegion',
                                               localize('AWS.explorerNode.addRegion.tooltip', 'Configure a region to show available functions'))
                    ]);
                }
            });
        });
    }

    refresh(context?: AWSContext) {
        this._onDidChangeTreeData.fire();
    }

    constructor() {
    }
}

