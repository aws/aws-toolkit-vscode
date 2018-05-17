'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { LambdaProvider } from './lambda/lambdaProvider';
import { S3Provider } from './s3/s3Provider';
import { CdkProvider } from './cdk/cdkProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "aws-vscode-tools" is now active!');

    const lambdaProvider = new LambdaProvider();
    const s3Provider = new S3Provider();
    const cdkProvider = new CdkProvider();

    vscode.window.registerTreeDataProvider('cdk', cdkProvider);
    vscode.window.registerTreeDataProvider('lambda', lambdaProvider);
    vscode.window.registerTreeDataProvider('s3', s3Provider);


    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
        // The code you place here will be executed every time your command is executed

        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}