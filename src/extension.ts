'use strict';

import * as vscode from 'vscode';

import { CdkProvider } from './cdk/cdkProvider';
import { LambdaProvider } from './lambda/lambdaProvider';
import { S3Provider } from './s3/s3Provider';

import { AWSClientBuilder } from './shared/awsClientBuilder';
import { ext } from './shared/extensionGlobals';
import { extensionSettingsPrefix } from './shared/constants';
import { getLambdaPolicy } from './lambda/commands/getLambdaPolicy';
import { FunctionNode } from './lambda/explorer/functionNode';
import { invokeLambda } from './lambda/commands/invokeLambda';
import { getLambdaConfig } from './lambda/commands/getLambdaConfig';
import { AWSContext } from './shared/awsContext';

export async function activate(context: vscode.ExtensionContext) {

    ext.awsContext = new AWSContext(extensionSettingsPrefix);
    ext.sdkClientBuilder = new AWSClientBuilder(ext.awsContext);

    // need to push all this down to our logical provider levels. and
    // operate on the collections and commands returned from them
    const lambdaProvider = new LambdaProvider();
    const cdkProvider = new CdkProvider();
    const s3Provider = new S3Provider();

    ext.treesToRefreshOnContextChange = [lambdaProvider];

    vscode.commands.registerCommand('aws.selectRegion', async () => { await ext.sdkClientBuilder.onCommandConfigureRegion(); });
    vscode.commands.registerCommand('aws.invokeLambda', async (node: FunctionNode) => await invokeLambda(node));
    vscode.commands.registerCommand('aws.getLambdaConfig', async (node: FunctionNode) => await getLambdaConfig(node));
    vscode.commands.registerCommand('aws.getLambdaPolicy', async (node: FunctionNode) => await getLambdaPolicy(node));

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('cdk', cdkProvider),
        vscode.window.registerTreeDataProvider('lambda', lambdaProvider),
        vscode.window.registerTreeDataProvider('s3', s3Provider),
    );
}

export function deactivate() {
}