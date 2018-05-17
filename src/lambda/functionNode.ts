'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import awsLambda = require('aws-sdk/clients/lambda');
import { ExplorerNodeBase } from '../shared/explorerNodeBase';

export class FunctionNode extends ExplorerNodeBase {
    constructor(
        public readonly functionConfiguration: awsLambda.FunctionConfiguration
    ) {
		super();
    }

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(this.functionConfiguration.FunctionName as string, vscode.TreeItemCollapsibleState.None);
        item.tooltip = `${this.functionConfiguration.FunctionName}-${this.functionConfiguration.FunctionArn}`;
        item.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'light', 'lambda_function.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'dark', 'lambda_function.svg')
        };

        return item;
    }
}
