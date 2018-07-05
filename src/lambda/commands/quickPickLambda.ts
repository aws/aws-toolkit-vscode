'use strict';

import * as vscode from 'vscode';
import { FunctionNode } from '../explorer/functionNode';

class QuickPickLambda extends FunctionNode implements vscode.QuickPickItem {
    label: string; description?: string | undefined;
    detail?: string | undefined;
    picked?: boolean | undefined;
    constructor(fn: FunctionNode) {
        super(fn.functionConfiguration, fn.lambda);
        this.label = fn.functionConfiguration.FunctionName!;
    }
}

export async function quickPickLambda(lambdas: FunctionNode[]): Promise<FunctionNode | undefined> {
    try {
        if (!lambdas || lambdas.length === 0) {
            vscode.window.showInformationMessage('There are no lambdas in this region.');
        } else {
            const qpLambdas = lambdas.map(l => new QuickPickLambda(l));
            return await vscode.window.showQuickPick(qpLambdas, { placeHolder: 'Choose a lambda' });
        }
        throw new Error('No lambdas to work with.');
    } catch (error) {
        vscode.window.showErrorMessage('Unable to connect to AWS.');
    }

}