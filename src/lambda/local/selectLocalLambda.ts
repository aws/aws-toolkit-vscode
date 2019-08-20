/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { detectLocalLambdas, LocalLambda } from './detectLocalLambdas'

export interface ShowQuickPickFunc {
    <T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<T | undefined>
}

export async function selectLocalLambda(
    workspaceFolders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders,
    showQuickPick: ShowQuickPickFunc = vscode.window.showQuickPick
): Promise<(LocalLambda & vscode.QuickPickItem) | undefined> {
    const localLambdas = (await detectLocalLambdas(workspaceFolders)).map(lambda => ({
        ...lambda,
        label: lambda.lambda,
        description: lambda.templatePath
    }))

    return await showQuickPick(localLambdas, {
        placeHolder: localize('AWS.message.prompt.selectLocalLambda.placeholder', 'Select a lambda function')
    })
}
