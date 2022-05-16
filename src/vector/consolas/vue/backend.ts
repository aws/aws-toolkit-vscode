/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../../../shared/extensions'
import { compileVueWebview } from '../../../webviews/main'

const VueWebview = compileVueWebview({
    // The `id` should match the value in `package.json`
    id: 'aws.consolas.enabledCodeSuggestions',
    title: 'Terms And Conditions',
    // The file name is generated, but this needs to be updated manually if changing the file structure
    webviewJs: 'vectorConsolasVue.js',

    // 'start' is the entry point for the view which can take any number of parameters
    // its return value is what the frontend code will receive
    start: (title?: string) => ({ title: title?.toUpperCase() }),

    // Events can be added here, they must be of type `vscode.EventEmitter`
    events: {
        onDidChangeTriggerStatus: new vscode.EventEmitter<boolean>(),
        onDidChangeKeyBinding: new vscode.EventEmitter<string>(),
    },

    // Add 'commands' (which are just functions) here
    // These are exposed directly to the frontend via the `client` object
    commands: {
        async controlTrigger() {
            await vscode.commands.executeCommand('aws.consolas.acceptTermsOfService')
            this.dispose()
        },
        async cancelCodeSuggestion() {
            await vscode.commands.executeCommand('aws.consolas.cancelTermsOfService')
            this.dispose()
        },
    },
})

export class ConsolasWebview extends VueWebview {}

export function activate(context: ExtContext) {
    const consolasWebview = new ConsolasWebview(context)

    // initializes the view
    consolasWebview.start()
}
