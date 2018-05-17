'use strict';

import * as vscode from 'vscode';
import awsLambda = require('aws-sdk/clients/lambda');
import { isNullOrUndefined } from 'util';
import { ExplorerNodeBase } from '../shared/explorerNodeBase';
import { FunctionNode } from './functionNode';

export class FunctionsNode extends ExplorerNodeBase {

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return new Promise(resolve => {
            this.queryLambdaFunctions().then(v => resolve(v));
        });
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Functions', vscode.TreeItemCollapsibleState.Expanded);
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

    async queryLambdaFunctions() : Promise<FunctionNode[]> {
        let arr: FunctionNode[] = [];

        try {
            const lambdaClient = this.constructServiceClient();

            const request: awsLambda.ListFunctionsRequest = {};
            do {
                await lambdaClient.listFunctions(request)
                    .promise()
                    .then(r => {
                        request.Marker = r.NextMarker;
                        if (r.Functions) {
                            r.Functions.forEach(f => {
                                arr.push(new FunctionNode(f));
                            });
                        }

                });
            } while (!isNullOrUndefined(request.Marker));
        } catch (error) {
            // todo
        }

        return arr;
    }
}
