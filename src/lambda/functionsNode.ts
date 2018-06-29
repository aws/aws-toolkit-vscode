'use strict';

import * as vscode from 'vscode';
import awsLambda = require('aws-sdk/clients/lambda');
import { ExplorerNodeBase } from '../shared/nodes';
import { listLambdas } from '../commands/lambda/listLambdas';

export class FunctionsNode extends ExplorerNodeBase {
    public static contextValue: string = 'awsLambdaFns';
    public readonly contextValue: string = FunctionsNode.contextValue;
    public readonly label: string = 'Lambda Functions';
    public async getChildren(): Promise<ExplorerNodeBase[]> {
        return await listLambdas();
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Functions', vscode.TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'My deployed Lambda functions';

        return item;
    }

    constructServiceClient(): awsLambda {
        const opts: awsLambda.ClientConfiguration = {
            apiVersion: '2015-03-31',
            region: 'us-west-2'
        };

        return new awsLambda(opts);
    }
}
