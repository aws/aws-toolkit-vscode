/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import { getLocalLambdaConfiguration } from '../../lambda/local/configureLocalLambda'
import { detectLocalLambdas } from '../../lambda/local/detectLocalLambdas'
import { CloudFormation } from '../cloudformation/cloudformation'
import { writeFile } from '../filesystem'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from '../sam/cli/samCliBuild'
import { SamCliProcessInvoker, SamCliTaskInvoker } from '../sam/cli/samCliInvokerUtils'
import { SamCliLocalInvokeInvocation } from '../sam/cli/samCliLocalInvoke'
import { SettingsConfiguration } from '../settingsConfiguration'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { ExtensionDisposableFiles } from '../utilities/disposableFiles'

import { generateDefaultHandlerConfig, HandlerConfig } from '../../lambda/config/templates'
import { DebugConfiguration } from '../../lambda/local/debugConfiguration'
import { TelemetryService } from '../telemetry/telemetryService'
import { normalizeSeparator } from '../utilities/pathUtils'
import { ChannelLogger, getChannelLogger, localize } from '../utilities/vsCodeUtils'

export interface LambdaLocalInvokeParams {
    document: vscode.TextDocument,
    range: vscode.Range,
    handlerName: string,
    isDebug: boolean,
    workspaceFolder: vscode.WorkspaceFolder,
    samTemplate: vscode.Uri,
}

export interface SAMTemplateEnvironmentVariables {
    [resource: string]: {
        [key: string]: string
    }
}

export interface OnDidSamBuildParams {
    buildDir: string,
    debugPort: number,
    handlerName: string,
    isDebug: boolean
}

const TEMPLATE_RESOURCE_NAME: string = 'awsToolkitSamLocalResource'
const SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS: number = 125
const SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS_DEFAULT: number = 30000
const MAX_DEBUGGER_ATTEMPTS: number = 10

// TODO: Consider replacing LocalLambdaRunner use with associated duplicative functions
export class LocalLambdaRunner {

    private _baseBuildFolder?: string
    private readonly _debugPort?: number

    public constructor(
        private readonly configuration: SettingsConfiguration,
        private readonly localInvokeParams: LambdaLocalInvokeParams,
        debugPort: number | undefined,
        private readonly runtime: string,
        // @ts-ignore noUnusedLocals
        private readonly outputChannel: vscode.OutputChannel,
        private readonly processInvoker: SamCliProcessInvoker,
        private readonly taskInvoker: SamCliTaskInvoker,
        private readonly debugConfig: DebugConfiguration,
        private readonly codeRootDirectoryPath: string,
        private readonly telemetryService: TelemetryService,
        private readonly onDidSamBuild?: (params: OnDidSamBuildParams) => Promise<void>,
        private readonly onWillAttachDebugger?: () => Promise<void>,
        private readonly channelLogger = getChannelLogger(outputChannel),
    ) {
        if (localInvokeParams.isDebug && !debugPort) {
            throw new Error('Debug port must be provided when launching in debug mode')
        }

        this._debugPort = debugPort
    }

    public async run(): Promise<void> {
        try {
            // Switch over to the output channel so the user has feedback that we're getting things ready
            this.channelLogger.channel.show(true)

            this.channelLogger.info(
                'AWS.output.sam.local.start',
                'Preparing to run {0} locally...',
                this.localInvokeParams.handlerName
            )

            const inputTemplate: string = await this.generateInputTemplate(this.codeRootDirectoryPath)
            const samBuildTemplate: string = await this.executeSamBuild(this.codeRootDirectoryPath, inputTemplate)

            await this.invokeLambdaFunction(samBuildTemplate)

        } catch (err) {
            const error = err as Error
            this.channelLogger.error(
                'AWS.error.during.sam.local',
                'An error occurred trying to run SAM Application locally: {0}',
                error
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

    public get debugPort(): number {
        if (!this._debugPort) {
            throw new Error('Debug port was expected but is undefined')
        }

        return this._debugPort
    }

    private async getBaseBuildFolder(): Promise<string> {
        // TODO: Clean up folder structure
        if (!this._baseBuildFolder) {
            this._baseBuildFolder = await makeTemporaryToolkitFolder()
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
            path.dirname(this.localInvokeParams.document.uri.fsPath)
        )

        const relativeFunctionHandler = path.join(
            handlerFileRelativePath,
            this.localInvokeParams.handlerName
        ).replace('\\', '/')

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.localInvokeParams.workspaceFolder.uri)
        let existingTemplateResource: CloudFormation.Resource | undefined
        if (workspaceFolder) {
            const lambdas = await detectLocalLambdas([workspaceFolder])
            const existingLambda = lambdas.find(lambda => lambda.handler === relativeFunctionHandler)
            existingTemplateResource = existingLambda ? existingLambda.resource : undefined
        }

        let newTemplate = new SamTemplateGenerator()
            .withCodeUri(rootCodeFolder)
            .withFunctionHandler(relativeFunctionHandler)
            .withResourceName(TEMPLATE_RESOURCE_NAME)
            .withRuntime(this.runtime)

        if (existingTemplateResource && existingTemplateResource.Properties &&
            existingTemplateResource.Properties.Environment) {
            newTemplate = newTemplate.withEnvironment(existingTemplateResource.Properties.Environment)
        }

        await newTemplate.generate(inputTemplatePath)

        return inputTemplatePath
    }

    private async executeSamBuild(
        rootCodeFolder: string,
        inputTemplatePath: string
    ): Promise<string> {
        this.channelLogger.info(
            'AWS.output.building.sam.application',
            'Building SAM Application...'
        )

        const samBuildOutputFolder = path.join(await this.getBaseBuildFolder(), 'output')

        const samCliArgs: SamCliBuildInvocationArguments = {
            buildDir: samBuildOutputFolder,
            baseDir: rootCodeFolder,
            templatePath: inputTemplatePath,
            invoker: this.processInvoker
        }
        await new SamCliBuildInvocation(samCliArgs).execute()

        this.channelLogger.info(
            'AWS.output.building.sam.application.complete',
            'Build complete.'
        )

        if (this.onDidSamBuild) {
            // Enable post build tasks if needed
            await this.onDidSamBuild({
                buildDir: samBuildOutputFolder,
                debugPort: this._debugPort!, // onDidSamBuild will only be called for debug, _debugPort will be defined
                handlerName: this.localInvokeParams.handlerName,
                isDebug: this.localInvokeParams.isDebug
            })
        }

        return path.join(samBuildOutputFolder, 'template.yaml')
    }

    /**
     * Runs `sam local invoke` against the provided template file
     * @param samTemplatePath sam template to run locally
     */
    private async invokeLambdaFunction(
        samTemplatePath: string,
    ): Promise<void> {
        this.channelLogger.info(
            'AWS.output.starting.sam.app.locally',
            'Starting the SAM Application locally (see Terminal for output)'
        )

        const eventPath: string = path.join(await this.getBaseBuildFolder(), 'event.json')
        const environmentVariablePath = path.join(await this.getBaseBuildFolder(), 'env-vars.json')
        const config = await this.getConfig()

        await writeFile(eventPath, JSON.stringify(config.event || {}))
        await writeFile(
            environmentVariablePath,
            JSON.stringify(this.getEnvironmentVariables(config))
        )

        const command = new SamCliLocalInvokeInvocation({
            templateResourceName: TEMPLATE_RESOURCE_NAME,
            templatePath: samTemplatePath,
            eventPath,
            environmentVariablePath,
            debugPort: (!!this._debugPort) ? this._debugPort.toString() : undefined,
            invoker: this.taskInvoker
        })

        const startInvokeTime = new Date()
        await command.execute()

        if (this.localInvokeParams.isDebug) {
            await waitForDebugPort({
                debugPort: this.debugPort,
                configuration: this.configuration,
                channelLogger: this.channelLogger
            })

            await this.attachDebugger(startInvokeTime.getTime())
        }
    }

    private async getConfig(): Promise<HandlerConfig> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.localInvokeParams.document.uri)
        if (!workspaceFolder) {
            return generateDefaultHandlerConfig()
        }

        const config: HandlerConfig = await getLocalLambdaConfiguration(
            workspaceFolder,
            this.localInvokeParams.handlerName,
            this.localInvokeParams.samTemplate
        )

        return config
    }

    private getEnvironmentVariables(config: HandlerConfig): SAMTemplateEnvironmentVariables {
        if (!!config.environmentVariables) {
            return {
                [TEMPLATE_RESOURCE_NAME]: config.environmentVariables
            }
        } else {
            return {}
        }
    }

    private async attachDebugger(startInvokeMillis: number) {
        if (this.onWillAttachDebugger) {
            // Enable caller to do last minute preparation before attaching debugger
            await this.onWillAttachDebugger()
        }
        this.channelLogger.info(
            'AWS.output.sam.local.attaching',
            'Attaching to SAM Application...'
        )
        const attachSuccess: boolean = await vscode.debug.startDebugging(undefined, this.debugConfig)

        const currTime = new Date()
        recordDebugAttachResult({
            telemetryService: this.telemetryService,
            attachResult: attachSuccess,
            attempts: 1,
            duration: currTime.getTime() - startInvokeMillis,
            runtime: this.runtime,
        })

        if (attachSuccess) {
            this.channelLogger.info(
                'AWS.output.sam.local.attach.success',
                'Debugger attached'
            )
        } else {
            // sam local either failed, or took too long to start up
            this.channelLogger.error(
                'AWS.output.sam.local.attach.failure',
                // tslint:disable-next-line:max-line-length
                'Unable to attach Debugger. Check the Terminal tab for output. If it took longer than expected to successfully start, you may still attach to it.'
            )
        }
    }
}

export const makeBuildDir = async (): Promise<string> => {
    const buildDir = await makeTemporaryToolkitFolder()
    ExtensionDisposableFiles.getInstance().addFolder(buildDir)

    return buildDir
}

export async function makeInputTemplate(params: {
    baseBuildDir: string,
    codeDir: string,
    documentUri: vscode.Uri
    originalHandlerName: string,
    handlerName: string,
    runtime: string,
    workspaceUri: vscode.Uri,
}): Promise<string> {
    const inputTemplatePath: string = path.join(params.baseBuildDir, 'input', 'input-template.yaml')
    ExtensionDisposableFiles.getInstance().addFolder(inputTemplatePath)

    // Make function handler relative to baseDir
    const handlerFileRelativePath = path.relative(
        params.codeDir,
        path.dirname(params.documentUri.fsPath)
    )

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(params.workspaceUri)
    let existingTemplateResource: CloudFormation.Resource | undefined
    if (workspaceFolder) {

        const relativeOriginalFunctionHandler = normalizeSeparator(
            path.join(
                handlerFileRelativePath,
                params.originalHandlerName,
            )
        )

        const lambdas = await detectLocalLambdas([workspaceFolder])
        const existingLambda = lambdas.find(lambda => lambda.handler === relativeOriginalFunctionHandler)
        existingTemplateResource = existingLambda ? existingLambda.resource : undefined
    }

    const relativeFunctionHandler = normalizeSeparator(
        path.join(
            handlerFileRelativePath,
            params.handlerName,
        )
    )

    let newTemplate = new SamTemplateGenerator()
        .withCodeUri(params.codeDir)
        .withFunctionHandler(relativeFunctionHandler)
        .withResourceName(TEMPLATE_RESOURCE_NAME)
        .withRuntime(params.runtime)

    if (existingTemplateResource && existingTemplateResource.Properties &&
        existingTemplateResource.Properties.Environment) {
        newTemplate = newTemplate.withEnvironment(existingTemplateResource.Properties.Environment)
    }

    await newTemplate.generate(inputTemplatePath)

    return inputTemplatePath
}

export async function executeSamBuild(params: {
    baseBuildDir: string,
    channelLogger: ChannelLogger,
    codeDir: string,
    inputTemplatePath: string,
    manifestPath?: string,
    samProcessInvoker: SamCliProcessInvoker,
}): Promise<string> {
    params.channelLogger.info(
        'AWS.output.building.sam.application',
        'Building SAM Application...'
    )

    const samBuildOutputFolder = path.join(params.baseBuildDir, 'output')

    const samCliArgs: SamCliBuildInvocationArguments = {
        buildDir: samBuildOutputFolder,
        baseDir: params.codeDir,
        templatePath: params.inputTemplatePath,
        invoker: params.samProcessInvoker,
        manifestPath: params.manifestPath
    }
    await new SamCliBuildInvocation(samCliArgs).execute()

    params.channelLogger.info(
        'AWS.output.building.sam.application.complete',
        'Build complete.'
    )

    return path.join(samBuildOutputFolder, 'template.yaml')
}

export const invokeLambdaFunction = async (params: {
    baseBuildDir: string,
    channelLogger: ChannelLogger,
    configuration: SettingsConfiguration,
    debugConfig: DebugConfiguration,
    documentUri: vscode.Uri,
    originalHandlerName: string,
    handlerName: string,
    isDebug?: boolean,
    originalSamTemplatePath: string,
    samTemplatePath: string,
    samTaskInvoker: SamCliTaskInvoker,
    telemetryService: TelemetryService,
    runtime: string,
    onWillAttachDebugger?(): Promise<void>,
}): Promise<void> => {
    params.channelLogger.info(
        'AWS.output.starting.sam.app.locally',
        'Starting the SAM Application locally (see Terminal for output)'
    )
    params.channelLogger.logger.debug(`localLambdaRunner.invokeLambdaFunction: ${JSON.stringify(
        {
            baseBuildDir: params.baseBuildDir,
            configuration: params.configuration,
            debugConfig: params.debugConfig,
            documentUri: vscode.Uri,
            handlerName: params.handlerName,
            originalHandlerName: params.originalHandlerName,
            isDebug: params.isDebug,
            samTemplatePath: params.samTemplatePath,
            originalSamTemplatePath: params.originalSamTemplatePath,
        },
        undefined,
        2)}`
    )

    const eventPath: string = path.join(params.baseBuildDir, 'event.json')
    const environmentVariablePath = path.join(params.baseBuildDir, 'env-vars.json')
    const config = await getConfig({
        handlerName: params.originalHandlerName,
        documentUri: params.documentUri,
        samTemplate: vscode.Uri.file(params.originalSamTemplatePath),
    })

    await writeFile(eventPath, JSON.stringify(config.event || {}))
    await writeFile(
        environmentVariablePath,
        JSON.stringify(getEnvironmentVariables(config))
    )

    const command = new SamCliLocalInvokeInvocation({
        templateResourceName: TEMPLATE_RESOURCE_NAME,
        templatePath: params.samTemplatePath,
        eventPath,
        environmentVariablePath,
        debugPort: (params.isDebug) ? params.debugConfig.port.toString() : undefined,
        invoker: params.samTaskInvoker
    })

    const startInvokeTime = new Date()
    await command.execute()

    if (params.isDebug) {
        await waitForDebugPort({
            debugPort: params.debugConfig.port,
            configuration: params.configuration,
            channelLogger: params.channelLogger
        })

        if (params.onWillAttachDebugger) {
            await params.onWillAttachDebugger()
        }
        await attachDebugger({
            channeLogger: params.channelLogger,
            debugConfig: params.debugConfig,
            telemetryService: params.telemetryService,
            startInvokeMillis: startInvokeTime.getTime(),
            runtime: params.runtime,
        })
    }
}

const getConfig = async (params: {
    handlerName: string
    documentUri: vscode.Uri
    samTemplate: vscode.Uri
}): Promise<HandlerConfig> => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(params.documentUri)
    if (!workspaceFolder) {
        return generateDefaultHandlerConfig()
    }

    const config: HandlerConfig = await getLocalLambdaConfiguration(
        workspaceFolder,
        params.handlerName,
        params.samTemplate,
    )

    return config
}

const getEnvironmentVariables = (config: HandlerConfig): SAMTemplateEnvironmentVariables => {
    if (!!config.environmentVariables) {
        return {
            [TEMPLATE_RESOURCE_NAME]: config.environmentVariables
        }
    } else {
        return {}
    }
}

export async function attachDebugger(params: {
    channeLogger: ChannelLogger,
    debugConfig: DebugConfiguration,
    telemetryService: TelemetryService,
    startInvokeMillis: number,
    runtime: string,
}): Promise<{ success: boolean }> {
    const channelLogger = params.channeLogger
    const logger = params.channeLogger.logger
    logger.debug(`localLambdaRunner.attachDebugger: startDebugging with debugConfig: ${JSON.stringify(
        params.debugConfig,
        undefined,
        2
    )}`)

    let isDebuggerAttached: boolean | undefined = false
    let numAttempts = 0
    let retryDelay = 1000
    let shouldRetry = false
    const retryEnabled = false // Change this to enable retry
    do {
        channelLogger.info(
            'AWS.output.sam.local.attaching',
            'Attempt number {0} to attach debugger to SAM Application...',
            String(numAttempts + 1)
        )
        isDebuggerAttached = await vscode.debug.startDebugging(undefined, params.debugConfig)
        numAttempts += 1
        if (isDebuggerAttached === undefined) {
            isDebuggerAttached = false
            shouldRetry = numAttempts < MAX_DEBUGGER_ATTEMPTS
        } else if (!isDebuggerAttached) {
            retryDelay *= 2

            shouldRetry = retryEnabled && (numAttempts < MAX_DEBUGGER_ATTEMPTS)
            if (shouldRetry) {
                const currTime = new Date()
                recordDebugAttachResult({
                    telemetryService: params.telemetryService,
                    attachResult: isDebuggerAttached,
                    attempts: numAttempts,
                    duration: currTime.getTime() - params.startInvokeMillis,
                    runtime: params.runtime,
                })

                channelLogger.info(
                    'AWS.output.sam.local.attach.retry',
                    'Will try to attach debugger again in {0} seconds...',
                    String(retryDelay / 1000)
                )

                // Wait <retryDelay> seconds and try again
                await new Promise<void>(resolve => {
                    setTimeout(resolve, retryDelay)
                })
            }
        }
    } while (!isDebuggerAttached && shouldRetry)

    recordDebugAttachResult({
        telemetryService: params.telemetryService,
        attachResult: isDebuggerAttached,
        attempts: numAttempts,
        duration: new Date().getTime() - params.startInvokeMillis,
        runtime: params.runtime,
    })

    if (isDebuggerAttached) {
        channelLogger.info(
            'AWS.output.sam.local.attach.success',
            'Debugger attached'
        )
    } else {
        channelLogger.error(
            'AWS.output.sam.local.attach.failure',
            // tslint:disable-next-line:max-line-length
            'Unable to attach Debugger. Check the Terminal tab for output. If it took longer than expected to successfully start, you may still attach to it.'
        )
    }

    return {
        success: isDebuggerAttached
    }
}

async function waitForDebugPort({
    debugPort,
    configuration,
    channelLogger,
}: {
    debugPort: number
    configuration: SettingsConfiguration
    channelLogger: ChannelLogger
}): Promise<void> {
    channelLogger.info(
        'AWS.output.sam.local.waiting',
        'Waiting for SAM Application to start before attaching debugger...'
    )

    const timeoutMillis = configuration.readSetting<number>(
        'samcli.debug.attach.timeout.millis',
        SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS_DEFAULT
    )

    await tcpPortUsed.waitUntilUsed(
        debugPort,
        SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS,
        timeoutMillis
    )
}

function recordDebugAttachResult({
    telemetryService,
    attachResult,
    attempts,
    duration,
    runtime,
}: {
    telemetryService: TelemetryService
    attachResult: boolean
    attempts: number
    duration: number
    runtime: string
}): void {
    const currTime = new Date()
    const namespace = attachResult ? 'DebugAttachSuccess' : 'DebugAttachFailure'

    const metadata = new Map([
        ['runtime', runtime],
    ])

    telemetryService.record({
        namespace: namespace,
        createTime: currTime,
        data: [
            {
                name: 'attempts',
                value: attempts,
                unit: 'Count',
                metadata,
            },
            {
                name: 'duration',
                value: duration,
                unit: 'Milliseconds',
                metadata,
            }
        ]
    })
}
