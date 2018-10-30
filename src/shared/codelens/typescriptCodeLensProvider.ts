/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'

interface LambdaLocalInvokeArguments {
    document: vscode.TextDocument,
    range: vscode.Range,
    handlerName: string,
}

export class TypescriptCodeLensProvider implements vscode.CodeLensProvider {
    public onDidChangeCodeLenses?: vscode.Event<void> | undefined

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(document.uri)
        const handlers: LambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

        const lenses: vscode.CodeLens[] = handlers.map(handler => {
            const range: vscode.Range = new vscode.Range(
                document.positionAt(handler.positionStart),
                document.positionAt(handler.positionEnd),
            )

            const commandArgs: LambdaLocalInvokeArguments = {
                document: document,
                range: range,
                handlerName: handler.handlerName,
            }

            const command: vscode.Command = {
                arguments: [commandArgs],
                command: 'aws.lambda.local.invoke',
                title: localize('AWS.codelens.lambda.invoke', 'Invoke Lambda'),
            }

            return new vscode.CodeLens(range, command)
        })

        return lenses
    }

    // optional method, might not need
    public resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens> {
        throw new Error('not implemented')
    }

    public static initialize(): void {
        vscode.commands.registerCommand(
            'aws.lambda.local.invoke',
            TypescriptCodeLensProvider.onLambdaLocalInvoke
        )
    }

    public static async onLambdaLocalInvoke(
        args: LambdaLocalInvokeArguments,
    ): Promise<void> {
        throw new Error('not implemented')
    }
}
