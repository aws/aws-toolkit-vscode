'use strict';

import * as vscode from 'vscode';

import { LambdaProvider } from './lambda/lambdaProvider';
import { S3Provider } from './s3/s3Provider';
import { CdkProvider } from './cdk/cdkProvider';
import { AWSClientBuilder } from './shared/awsClientBuilder';
import { ext } from './shared/extensionGlobals';
import { getLambdaPolicy } from './commands/lambda/getLambdaPolicy';
import { FunctionNode } from './lambda/functionNode';
import { invokeLambda } from './commands/lambda/invokeLambda';
import { getLambdaConfig } from './commands/lambda/getLambdaConfig';

export async function activate(context: vscode.ExtensionContext) {

    ext.clientBuilder = new AWSClientBuilder();
    await ext.clientBuilder.build();

    const lambdaProvider = new LambdaProvider();
    const s3Provider = new S3Provider();
    const cdkProvider = new CdkProvider();
    ext.treesToRefreshOnRegionChange = [lambdaProvider];

    vscode.commands.registerCommand('aws.selectRegion', async () => { await ext.clientBuilder.configureRegion(); });
    vscode.commands.registerCommand('aws.invokeLambda', async (node: FunctionNode) => await invokeLambda(node));
    vscode.commands.registerCommand('aws.getLambdaConfig', async (node: FunctionNode) => await getLambdaConfig(node));
    vscode.commands.registerCommand('aws.getLambdaPolicy', async (node: FunctionNode) => await getLambdaPolicy(node));
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('cdk', cdkProvider),
        vscode.window.registerTreeDataProvider('lambda', lambdaProvider),
        vscode.window.registerTreeDataProvider('s3', s3Provider)
    );
}

export function deactivate() {
}