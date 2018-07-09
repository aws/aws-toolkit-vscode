'use strict';

import * as vscode from 'vscode';

import { CdkProvider } from './cdk/cdkProvider';
import { LambdaProvider } from './lambda/lambdaProvider';
import { S3Provider } from './s3/s3Provider';

import { AWSClientBuilder } from './shared/awsClientBuilder';
import { ext } from './shared/extensionGlobals';
import { extensionSettingsPrefix } from './shared/constants';
import { AWSContext } from './shared/awsContext';
import { SettingsConfiguration } from './shared/settingsConfiguration';

export async function activate(context: vscode.ExtensionContext) {

    ext.awsContext = new AWSContext(new SettingsConfiguration(extensionSettingsPrefix));
    ext.sdkClientBuilder = new AWSClientBuilder(ext.awsContext);

    vscode.commands.registerCommand('aws.selectProfile', async () => { await ext.sdkClientBuilder.onCommandConfigureProfile(); });
    vscode.commands.registerCommand('aws.selectRegion', async () => { await ext.sdkClientBuilder.onCommandConfigureRegion(); });

    const providers = [
        new LambdaProvider(),
        new CdkProvider(),
        new S3Provider()
    ];

    providers.forEach( (p) => {
        p.initialize();
        context.subscriptions.push(vscode.window.registerTreeDataProvider(p.viewProviderId, p));
    });
}

export function deactivate() {
}