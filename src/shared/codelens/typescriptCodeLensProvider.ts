/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import { NodeDebugConfiguration } from '../../lambda/local/debugConfigurationProvider'
import * as fileSystem from '../filesystem'
import * as filesystemUtilities from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { SamCliBuildInvocation } from '../sam/cli/samCliBuild'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker,
    SamCliProcessInvoker,
    SamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
import { SamCliLocalInvokeInvocation } from '../sam/cli/samCliLocalInvoke'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'
import { ExtensionDisposableFiles } from '../utilities/disposableFiles'

interface LambdaLocalInvokeArguments {
    document: vscode.TextDocument,
    range: vscode.Range,
    handlerName: string,
    debug: boolean,
}

export class TypescriptCodeLensProvider implements vscode.CodeLensProvider {
    public onDidChangeCodeLenses?: vscode.Event<void> | undefined

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(document.uri)
        const handlers: LambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

        const lenses: vscode.CodeLens[] = []

        handlers.forEach(handler => {
            const range: vscode.Range = new vscode.Range(
                document.positionAt(handler.positionStart),
                document.positionAt(handler.positionEnd),
            )

            lenses.push(this.generateLocalInvokeCodeLens(document, range, handler.handlerName, false))
            lenses.push(this.generateLocalInvokeCodeLens(document, range, handler.handlerName, true))
        })

        return lenses
    }

    public resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens> {
        throw new Error('not implemented')
    }

    private generateLocalInvokeCodeLens(
        document: vscode.TextDocument,
        range: vscode.Range,
        handlerName: string,
        debug: boolean,
    ): vscode.CodeLens {
        const title: string = debug ?
            localize('AWS.codelens.lambda.invoke.debug', 'Debug') :
            localize('AWS.codelens.lambda.invoke', 'Run')

        const commandArgs: LambdaLocalInvokeArguments = {
            document: document,
            range: range,
            handlerName: handlerName,
            debug: debug,
        }

        const command: vscode.Command = {
            arguments: [commandArgs],
            command: 'aws.lambda.local.invoke',
            title: title,
        }

        return new vscode.CodeLens(range, command)
    }

    public static initialize(
        toolkitOutputChannel: vscode.OutputChannel,
        processInvoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker(),
        taskInvoker: SamCliTaskInvoker = new DefaultSamCliTaskInvoker()
    ): void {
        vscode.commands.registerCommand(
            'aws.lambda.local.invoke',
            async (args: LambdaLocalInvokeArguments) => {
                const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
                    args,
                    'nodejs8.10',
                    toolkitOutputChannel,
                    processInvoker,
                    taskInvoker
                )

                await localLambdaRunner.run()
            }
        )
    }
}

class LocalLambdaRunner {

    private static readonly TEMPLATE_RESOURCE_NAME: string = 'awsToolkitSamLocalResource'
    private static readonly SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS: number = 125
    private static readonly SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS: number = 30000

    private _baseBuildFolder?: string

    public constructor(
        private readonly localInvokeArgs: LambdaLocalInvokeArguments,
        private readonly runtime: string,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly processInvoker: SamCliProcessInvoker,
        private readonly taskInvoker: SamCliTaskInvoker
    ) {
    }

    public async run(): Promise<void> {
        try {
            this.outputChannel.show(true)
            this.outputChannel.appendLine(
                localize(
                    'AWS.output.sam.local.start',
                    'Preparing to run {0} locally...',
                    this.localInvokeArgs.handlerName
                )
            )

            const rootCodeFolder: string = await this.determineRootCodeFolder()

            const inputTemplate: string = await this.generateInputTemplate(rootCodeFolder)
            const samBuildTemplate: string = await this.executeSamBuild(rootCodeFolder, inputTemplate)

            const debugPort: number | undefined = this.localInvokeArgs.debug ? await this.getDebugPort() : undefined

            await this.invokeLambdaFunction(samBuildTemplate, debugPort)

        } catch (err) {
            console.log(err)
            const error = err as Error

            this.outputChannel.appendLine(
                localize(
                    'AWS.output.sam.local.error',
                    'Error: {0}',
                    error.message
                )
            )

            vscode.window.showErrorMessage(
                localize(
                    'AWS.error.during.sam.local',
                    'An error occurred trying to run SAM Application locally: {0}',
                    error.message
                )
            )

            return
        }

    }

    private async getBaseBuildFolder(): Promise<string> {
        if (!this._baseBuildFolder) {
            this._baseBuildFolder = await fileSystem.mkdtempAsync(
                path.join(
                    ExtensionDisposableFiles.getInstance().toolkitTempFolder,
                    'build-'
                )
            )

            ExtensionDisposableFiles.getInstance().addFolder(this._baseBuildFolder)
        }

        return this._baseBuildFolder
    }

    /**
     * Create the SAM Template that will be passed in to sam build.
     * @returns Path to the generated template file
     */
    private async generateInputTemplate(
        rootCodeFolder: string
    ): Promise<string> {
        const buildFolder: string = await this.getBaseBuildFolder()
        const inputTemplatePath: string = path.join(buildFolder, 'input', 'input-template.yaml')

        // Make function handler relative to baseDir
        const handlerFileRelativePath = path.relative(
            rootCodeFolder,
            path.dirname(this.localInvokeArgs.document.uri.fsPath)
        )

        const relativeFunctionHandler = path.join(
            handlerFileRelativePath,
            this.localInvokeArgs.handlerName
        ).replace('\\', '/')

        await new SamTemplateGenerator()
            .withCodeUri(rootCodeFolder)
            .withFunctionHandler(relativeFunctionHandler)
            .withResourceName(LocalLambdaRunner.TEMPLATE_RESOURCE_NAME)
            .withRuntime(this.runtime)
            .generate(inputTemplatePath)

        return inputTemplatePath
    }

    private async determineRootCodeFolder(): Promise<string> {
        const packageJsonPath: string | undefined =
            await filesystemUtilities.findFileInParentPaths(
                path.dirname(this.localInvokeArgs.document.uri.fsPath),
                'package.json'
            )

        if (!packageJsonPath) {
            throw new Error(
                localize(
                    'AWS.error.sam.local.package_json_not_found',
                    'Unable to find package.json related to {0}',
                    this.localInvokeArgs.document.uri.fsPath
                )
            )
        }

        return path.dirname(packageJsonPath)
    }

    private async executeSamBuild(
        rootCodeFolder: string,
        inputTemplatePath: string
    ): Promise<string> {
        this.outputChannel.appendLine(
            localize(
                'AWS.output.building.sam.application',
                'Building SAM Application...'
            )
        )

        const samBuildOutputFolder = path.join(await this.getBaseBuildFolder(), 'output')

        await new SamCliBuildInvocation(
            samBuildOutputFolder,
            rootCodeFolder,
            inputTemplatePath,
            this.processInvoker
        ).execute()

        this.outputChannel.appendLine(
            localize(
                'AWS.output.building.sam.application.complete',
                'Build complete.'
            )
        )

        return path.join(samBuildOutputFolder, 'template.yaml')
    }

    /**
     * Runs `sam local invoke` against the provided template file
     * @param samTemplatePath sam template to run locally
     * @param debugPort Optional
     *                  - when omitted, the lambda function is invoked locally
     *                  - when provided, the debugger will attempt to attach to local invoke
     */
    private async invokeLambdaFunction(
        samTemplatePath: string,
        debugPort: number | undefined,
    ): Promise<void> {
        this.outputChannel.appendLine(
            localize(
                'AWS.output.starting.sam.app.locally',
                'Starting the SAM Application locally (see Terminal for output)'
            )
        )

        let debugPortStr: string | undefined

        if (this.localInvokeArgs.debug) {
            debugPortStr = debugPort!.toString()
        }

        // TODO : events will be driven from somewhere else in the future.
        const eventPath: string = path.join(await this.getBaseBuildFolder(), 'event.json')
        await fileSystem.writeFileAsync(eventPath, '{}')

        const command: SamCliLocalInvokeInvocation = new SamCliLocalInvokeInvocation(
            LocalLambdaRunner.TEMPLATE_RESOURCE_NAME,
            samTemplatePath,
            eventPath,
            debugPortStr,
            this.taskInvoker
        )

        await command.execute()

        if (this.localInvokeArgs.debug) {
            this.outputChannel.appendLine(
                localize(
                    'AWS.output.sam.local.waiting',
                    'Waiting for SAM Application to start before attaching debugger...'
                )
            )
            await tcpPortUsed.waitUntilUsed(
                debugPort!,
                LocalLambdaRunner.SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS,
                LocalLambdaRunner.SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS
            )

            await this.attachDebugger(debugPort!)
        }
    }

    private async attachDebugger(debugPort: number) {
        const rootFolder = await this.determineRootCodeFolder()

        const debugConfig: NodeDebugConfiguration = {
            type: 'node',
            request: 'attach',
            name: 'SamLocalDebug',
            preLaunchTask: undefined,
            address: 'localhost',
            port: debugPort!,
            localRoot: rootFolder,
            remoteRoot: '/var/task',
            protocol: 'inspector',
            skipFiles: [
                '/var/runtime/node_modules/**/*.js',
                '<node_internals>/**/*.js'
            ]
        }

        this.outputChannel.appendLine(
            localize(
                'AWS.output.sam.local.attaching',
                'Attaching to SAM Application...'
            )
        )

        const attachSuccess: boolean = await vscode.debug.startDebugging(undefined, debugConfig)

        if (attachSuccess) {
            this.outputChannel.appendLine(
                localize(
                    'AWS.output.sam.local.attach.success',
                    'Debugger attached'
                )
            )
        } else {
            // sam local either failed, or took too long to start up
            this.outputChannel.appendLine(
                localize(
                    'AWS.output.sam.local.attach.failure',
                    // tslint:disable-next-line:max-line-length
                    'Unable to attach Debugger. Check the Terminal tab for output. If it took longer than expected to successfully start, you may still attach to it.'
                )
            )
        }
    }

    private async getDebugPort(): Promise<number> {
        // TODO : in the future, search for an available port
        return 5858
    }
}
