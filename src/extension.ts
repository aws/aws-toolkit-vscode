'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import { LambdaProvider } from './lambda/lambdaProvider';
import { AWSClientBuilder } from './shared/awsClientBuilder';
import { ext } from './shared/extensionGlobals';
import { extensionSettingsPrefix } from './shared/constants';
import { AWSContext } from './shared/awsContext';
import { SettingsConfiguration } from './shared/settingsConfiguration';
import { AWSStatusBar } from './shared/statusBar';
import { AWSContextCommands } from './shared/awsContextCommands';

export async function activate(context: vscode.ExtensionContext) {

    nls.config(process.env.VSCODE_NLS_CONFIG)();

    ext.context = context;
    ext.awsContext = new AWSContext(new SettingsConfiguration(extensionSettingsPrefix));
    ext.awsContextCommands = new AWSContextCommands();
    ext.sdkClientBuilder = new AWSClientBuilder(ext.awsContext);
    ext.statusBar = new AWSStatusBar(context);

    vscode.commands.registerCommand('aws.login', async () => { await ext.awsContextCommands.onCommandLogin(); });
    vscode.commands.registerCommand('aws.logout', async () => { await ext.awsContextCommands.onCommandLogout(); });

    vscode.commands.registerCommand('aws.addExplorerRegion', async () => { await ext.awsContextCommands.onCommandAddExplorerRegion(); });
    vscode.commands.registerCommand('aws.removeExplorerRegion', async () => { await ext.awsContextCommands.onCommandRemoveExplorerRegion(); });

    const providers = [
        new LambdaProvider()
    ];

    providers.forEach( (p) => {
        p.initialize();
        context.subscriptions.push(vscode.window.registerTreeDataProvider(p.viewProviderId, p));
    });

    ext.statusBar.updateContext(undefined);
}

export function deactivate() {
}