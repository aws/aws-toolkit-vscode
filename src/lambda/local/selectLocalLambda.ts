/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { ext } from '../../shared/extensionGlobals'
import { types as vscode } from '../../shared/vscode'
import { detectLocalLambdas, LocalLambda } from './detectLocalLambdas'

export interface ShowQuickPickFunc {
    <T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<T | undefined>
}

export async function selectLocalLambda(
    workspaceFolders: vscode.WorkspaceFolder[] | undefined = ext.vscode.workspace.workspaceFolders
): Promise<(LocalLambda & vscode.QuickPickItem) | undefined> {
    const localLambdas = (await detectLocalLambdas(workspaceFolders)).map(lambda => ({
        ...lambda,
        label: lambda.lambda,
        description: lambda.templatePath
    }))

    return await ext.vscode.window.showQuickPick(
        localLambdas,
        {
            placeHolder: localize(
                'AWS.message.prompt.selectLocalLambda.placeholder',
                'Select a lambda function'
            )
        }
    )
}
