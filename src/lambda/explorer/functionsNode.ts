'use strict';

import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { AWSTreeNodeBase } from '../../shared/awsTreeNodeBase';
import { FunctionNode } from './functionNode';
import { ext } from '../../shared/extensionGlobals';
import Lambda = require('aws-sdk/clients/lambda');
import { listLambdas } from '../utils';

export class FunctionsNode extends AWSTreeNodeBase {
    public static contextValue: string = 'awsLambdaFns';
    public readonly contextValue: string = FunctionsNode.contextValue;
    public readonly label: string = 'Lambda Functions';

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return new Promise(resolve => {
            this.queryDeployedLambdaFunctions().then((result) => resolve(result));
        });
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem('Functions', TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'My deployed Lambda functions';

        return item;
    }

    private async queryDeployedLambdaFunctions() : Promise<FunctionNode[]> {
        const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(Lambda, undefined);
        return await listLambdas(client);
    }
}
