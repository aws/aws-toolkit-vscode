'use strict';
import * as path from 'path';
import awsLambda = require('aws-sdk/clients/lambda');
import { ExplorerNodeBase } from '../shared/nodes';
import { TreeItem, Uri, ThemeIcon } from 'vscode';

export class FunctionNode extends ExplorerNodeBase implements TreeItem {
    public static contextValue: string = 'awsLambdaFn';
    public contextValue: string = FunctionNode.contextValue;
    public label?: string;
    public tooltip?: string;
    public iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    constructor(
        public readonly functionConfiguration: awsLambda.FunctionConfiguration
    ) {
        super();
        this.label = `${this.functionConfiguration.FunctionName!}`;
        this.tooltip = `${this.functionConfiguration.FunctionName}-${this.functionConfiguration.FunctionArn}`;
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'lambda_function.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lambda_function.svg')
        };
    }

    getChildren(): FunctionNode[] {
        return [];
    }

    getTreeItem(): FunctionNode | Promise<FunctionNode> {
        return this;
    }
}
