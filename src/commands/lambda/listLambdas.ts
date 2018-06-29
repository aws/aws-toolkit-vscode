import { FunctionNode } from '../../lambda/functionNode';
import { ext } from '../../shared/extensionGlobals';
import * as vscode from 'vscode';
import { isNullOrUndefined } from 'util';
import { ListFunctionsRequest } from 'aws-sdk/clients/lambda';

export async function listLambdas(): Promise<FunctionNode[]> {
    // change status message on status bar.
    // don't forget to dispose to turn message off.
    const status = vscode.window.setStatusBarMessage('Loading lambdas...');
    let arr: FunctionNode[] = [];

    try {
        const request: ListFunctionsRequest = {};
        do {
            await ext.lambdaClient.listFunctions(request)
                .promise()
                .then(r => {
                    request.Marker = r.NextMarker;
                    if (r.Functions) {
                        r.Functions.forEach(f => {
                            const func = new FunctionNode(f);
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