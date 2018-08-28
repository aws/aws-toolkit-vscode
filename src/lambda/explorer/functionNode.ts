'use strict';

import { TreeItem, Uri, ThemeIcon } from 'vscode';
import * as path from 'path';
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase';
import Lambda = require('aws-sdk/clients/lambda');

export class FunctionNode extends AWSTreeNodeBase implements TreeItem {
    public static contextValue: string = 'awsLambdaFn';
    public contextValue: string = FunctionNode.contextValue;

    public label?: string;
    public tooltip?: string;
    public iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    constructor(
        public readonly functionConfiguration: Lambda.FunctionConfiguration,
        public readonly lambda: Lambda
    ) {
        super();
        this.label = `${this.functionConfiguration.FunctionName!}`;
        this.tooltip = `${this.functionConfiguration.FunctionName}-${this.functionConfiguration.FunctionArn}`;
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'lambda_function.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lambda_function.svg')
        };
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return new Promise(resolve => resolve([]));
    }

    public getTreeItem(): TreeItem {
        return this;
    }
}
