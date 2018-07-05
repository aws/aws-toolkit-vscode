'use strict';

import * as vscode from 'vscode';
import { isNullOrUndefined } from 'util';
import { FunctionNode } from './explorer/functionNode';
import { ext } from '../shared/extensionGlobals';
import { quickPickLambda } from './commands/quickPickLambda';
import Lambda = require('aws-sdk/clients/lambda');

export async function getSelectedLambdaNode(element?: FunctionNode): Promise<FunctionNode> {
    if (element && element.functionConfiguration) {
        console.log('returning preselected node...');
        return element;
    }

    console.log('prompting for lambda selection...');
    // might want to work on a cache to reduce calls to AWS.
    const lambdas = await listLambdas(await ext.sdkClientBuilder.createAndConfigureSdkClient(Lambda, undefined));
    // used to show a list of lambdas and allow user to select.
    // this is useful for calling commands from the command palette
    const selection = await quickPickLambda(lambdas);
    if (selection && selection.functionConfiguration) {
        return selection;
    }

    throw new Error('No lambda found.');
}

export async function listLambdas(lambda: Lambda): Promise<FunctionNode[]> {
    // change status message on status bar.
    // don't forget to dispose to turn message off.
    const status = vscode.window.setStatusBarMessage('Loading lambdas...');
    let arr: FunctionNode[] = [];

    try {
        const request: Lambda.ListFunctionsRequest = {};
        do {
            await lambda.listFunctions(request)
                .promise()
                .then(r => {
                    request.Marker = r.NextMarker;
                    if (r.Functions) {
                        r.Functions.forEach(f => {
                            const func = new FunctionNode(f, lambda);
                            func.contextValue = 'awsLambdaFn';
                            arr.push(func);
                        });
                    }

                });
        } while (!isNullOrUndefined(request.Marker));
    } catch (error) {
        // todo
    }
    status.dispose();
    return arr;
}

