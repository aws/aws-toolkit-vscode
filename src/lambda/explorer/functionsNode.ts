'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../../shared/nodes';
import { ext } from '../../shared/extensionGlobals';
import Lambda = require('aws-sdk/clients/lambda');
import { listLambdas } from '../utils';

export class FunctionsNode extends ExplorerNodeBase {
    public static contextValue: string = 'awsLambdaFns';
    public readonly contextValue: string = FunctionsNode.contextValue;
    public readonly label: string = 'Lambda Functions';

    public async getChildren(): Promise<ExplorerNodeBase[]> {
        return await listLambdas(await ext.sdkClientBuilder.createAndConfigureSdkClient(Lambda, undefined));
    }

    public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Functions', vscode.TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'My deployed Lambda functions';

        return item;
    }
}
