/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'

import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
<<<<<<< HEAD
import { getLogger, Logger } from '../logger'
import { SamCliBuildInvocation } from '../sam/cli/samCliBuild'
=======
>>>>>>> develop
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker,
    SamCliProcessInvoker,
    SamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
import { SettingsConfiguration } from '../settingsConfiguration'
import { ResultWithTelemetry } from '../telemetry/telemetryEvent'
import { defaultMetricDatum, registerCommand } from '../telemetry/telemetryUtils'
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'
import { LambdaLocalInvokeArguments, LocalLambdaRunner } from './localLambdaRunner'

export class TypescriptCodeLensProvider implements vscode.CodeLensProvider {
    public onDidChangeCodeLenses?: vscode.Event<void> | undefined

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {

        const logger: Logger = getLogger()
        const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(document.uri)
        const handlers: LambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

        const lenses: vscode.CodeLens[] = []

        handlers.forEach(handler => {
            const range: vscode.Range = new vscode.Range(
                document.positionAt(handler.positionStart),
                document.positionAt(handler.positionEnd),
            )
            const workspaceFolder:
                vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(document.uri)

            if (!workspaceFolder) {
                throw new Error(`Source file ${document.uri} is external to the current workspace.`)
            }

            lenses.push(this.generateLocalInvokeCodeLens(document, range, handler.handlerName, false, workspaceFolder))
            lenses.push(this.generateLocalInvokeCodeLens(document, range, handler.handlerName, true, workspaceFolder))

            try {
                lenses.push(this.generateConfigureCodeLens(document, range, handler.handlerName, workspaceFolder))
            } catch (err) {
                const error = err as Error

                logger.error(
                    `Could not generate 'configure' code lens for handler '${handler.handlerName}': `, error
                )
            }
        })

        return lenses
    }

    public resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens> {
        throw new Error('not implemented')
    }

    private generateConfigureCodeLens(
        document: vscode.TextDocument,
        range: vscode.Range,
        handlerName: string,
        workspaceFolder?: vscode.WorkspaceFolder
    ) {
        // Handler will be the fully-qualified name, so we also allow '.' despite it being forbidden in handler names.
        if (/[^\w\-\.]/.test(handlerName)) {
            throw new Error(
                `Invalid handler name: '${handlerName}'. ` +
                'Handler names can contain only letters, numbers, hyphens, and underscores.'
            )
        }

        const command = {
            arguments: [workspaceFolder, handlerName],
            command: 'aws.configureLambda',
            title: localize('AWS.command.configureLambda', 'Configure')
        }

        return new vscode.CodeLens(range, command)
    }

    private generateLocalInvokeCodeLens(
        document: vscode.TextDocument,
        range: vscode.Range,
        handlerName: string,
        debug: boolean,
        workspaceFolder: vscode.WorkspaceFolder,
    ): vscode.CodeLens {
        const title: string = debug ?
            localize('AWS.codelens.lambda.invoke.debug', 'Debug Locally') :
            localize('AWS.codelens.lambda.invoke', 'Run Locally')

        const commandArgs: LambdaLocalInvokeArguments = {
            document,
            range,
            handlerName,
            debug,
            workspaceFolder,
        }

        const command: vscode.Command = {
            arguments: [commandArgs],
            command: 'aws.lambda.local.invoke',
            title
        }

        return new vscode.CodeLens(range, command)
    }

    public static initialize(
        configuration: SettingsConfiguration,
        toolkitOutputChannel: vscode.OutputChannel,
        processInvoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker(),
        taskInvoker: SamCliTaskInvoker = new DefaultSamCliTaskInvoker()
    ): void {
        const command = 'aws.lambda.local.invoke'

        registerCommand({
            command: command,
            callback: async (args: LambdaLocalInvokeArguments): Promise<ResultWithTelemetry<void>> => {

                let debugPort: number | undefined

                if (args.debug) {
                    debugPort = await TypescriptCodeLensProvider.determineDebugPort()
                }

                const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
                    configuration,
                    args,
                    debugPort,
                    'nodejs8.10',
                    toolkitOutputChannel,
                    processInvoker,
                    taskInvoker
                )

                await localLambdaRunner.run()

                const datum = defaultMetricDatum(command)
                datum.metadata = new Map([
                    ['runtime', localLambdaRunner.runtime],
                    ['debug', `${args.debug}`]
                ])

                return {
                    telemetryDatum: datum
                }
            }
        })
    }

    private static async determineDebugPort(): Promise<number> {
        // TODO : in the future, move this to a utility class and search for an available port
        return 5858
    }
}
