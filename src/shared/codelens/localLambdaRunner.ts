/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import { detectLocalLambdas, LocalLambda } from '../../lambda/local/detectLocalLambdas'
import { CloudFormation } from '../cloudformation/cloudformation'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from '../sam/cli/samCliBuild'
import { SamCliProcessInvoker } from '../sam/cli/samCliInvokerUtils'
import {
    SamCliLocalInvokeInvocation,
    SamCliLocalInvokeInvocationArguments,
    SamLocalInvokeCommand,
} from '../sam/cli/samCliLocalInvoke'
import { SettingsConfiguration } from '../settingsConfiguration'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { ExtensionDisposableFiles } from '../utilities/disposableFiles'

import { writeFile } from 'fs-extra'
import { getHandlerConfig, HandlerConfig } from '../../lambda/config/templates'
import { DebugConfiguration } from '../../lambda/local/debugConfiguration'
import { getFamily, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { getLogger } from '../logger'
import { recordSamAttachDebugger, Runtime } from '../telemetry/telemetry'
import { TelemetryService } from '../telemetry/telemetryService'
import { normalizeSeparator } from '../utilities/pathUtils'
import { Timeout } from '../utilities/timeoutUtils'
import { ChannelLogger, getChannelLogger } from '../utilities/vsCodeUtils'

export interface LambdaLocalInvokeParams {
    document: vscode.TextDocument
    range: vscode.Range
    handlerName: string
    isDebug: boolean
    workspaceFolder: vscode.WorkspaceFolder
    samTemplate: vscode.Uri
}

export interface SAMTemplateEnvironmentVariables {
    [resource: string]: {
        [key: string]: string
    }
}

const TEMPLATE_RESOURCE_NAME = 'awsToolkitSamLocalResource'
const SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS: number = 125
const SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS_DEFAULT: number = 30000
const MAX_DEBUGGER_RETRIES_DEFAULT: number = 30
const ATTACH_DEBUGGER_RETRY_DELAY_MILLIS: number = 200

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
        private readonly localInvokeCommand: SamLocalInvokeCommand,
        private readonly debugConfig: DebugConfiguration,
        private readonly codeRootDirectoryPath: string,
        private readonly telemetryService: TelemetryService,
        private readonly channelLogger = getChannelLogger(outputChannel)
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

            const config = await getHandlerConfig({
                handlerName: this.localInvokeParams.handlerName,
                documentUri: this.localInvokeParams.document.uri,
                samTemplate: this.localInvokeParams.samTemplate,
            })

            const samBuildTemplate: string = await executeSamBuild({
                baseBuildDir: await this.getBaseBuildFolder(),
                channelLogger: this.channelLogger,
                codeDir: this.codeRootDirectoryPath,
                inputTemplatePath: inputTemplate,
                samProcessInvoker: this.processInvoker,
                useContainer: config.useContainer,
            })

            await this.invokeLambdaFunction(samBuildTemplate)
        } catch (err) {
            const error = err as Error
            this.channelLogger.error(
                'AWS.error.during.sam.local',
                'An error occurred trying to run SAM Application locally: {0}',
                error
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
    private async generateInputTemplate(rootCodeFolder: string): Promise<string> {
        const buildFolder: string = await this.getBaseBuildFolder()

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.localInvokeParams.workspaceFolder.uri)
        let properties: CloudFormation.ResourceProperties | undefined
        let globals: CloudFormation.TemplateGlobals | undefined
        if (workspaceFolder) {
            const lambdas = await detectLocalLambdas([workspaceFolder])
            const existingLambda = lambdas.find(lambda => lambda.handler === this.localInvokeParams.handlerName)

            if (existingLambda) {
                if (existingLambda.resource && existingLambda.resource.Properties) {
                    properties = existingLambda.resource.Properties
                }

                if (existingLambda.templateGlobals) {
                    globals = existingLambda.templateGlobals
                }
            }
        }

        return await makeInputTemplate({
            baseBuildDir: buildFolder,
            codeDir: rootCodeFolder,
            relativeFunctionHandler: this.localInvokeParams.handlerName,
            globals,
            properties,
            runtime: this.runtime,
        })
    }

    /**
     * Runs `sam local invoke` against the provided template file
     * @param samTemplatePath sam template to run locally
     */
    private async invokeLambdaFunction(samTemplatePath: string): Promise<void> {
        this.channelLogger.info(
            'AWS.output.starting.sam.app.locally',
            'Starting the SAM Application locally (see Terminal for output)'
        )

        const eventPath: string = path.join(await this.getBaseBuildFolder(), 'event.json')
        const environmentVariablePath = path.join(await this.getBaseBuildFolder(), 'env-vars.json')
        const config = await getHandlerConfig({
            handlerName: this.localInvokeParams.handlerName,
            documentUri: this.localInvokeParams.document.uri,
            samTemplate: this.localInvokeParams.samTemplate,
        })
        const maxRetries: number = getAttachDebuggerMaxRetryLimit(this.configuration, MAX_DEBUGGER_RETRIES_DEFAULT)

        await writeFile(eventPath, JSON.stringify(config.event || {}))
        await writeFile(environmentVariablePath, JSON.stringify(getEnvironmentVariables(config)))

        const command = new SamCliLocalInvokeInvocation({
            templateResourceName: TEMPLATE_RESOURCE_NAME,
            templatePath: samTemplatePath,
            eventPath,
            environmentVariablePath,
            debugPort: !!this._debugPort ? this._debugPort.toString() : undefined,
            invoker: this.localInvokeCommand,
            dockerNetwork: config.dockerNetwork,
        })

        const timer = createInvokeTimer(this.configuration)
        await command.execute(timer)

        if (this.localInvokeParams.isDebug) {
            messageUserWaitingToAttach(this.channelLogger)
            await waitForDebugPort(this.debugPort, timer, this.channelLogger)

            const attachResults = await attachDebugger({
                debugConfig: this.debugConfig,
                maxRetries,
                retryDelayMillis: ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
                channelLogger: this.channelLogger,
                onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number): void => {
                    recordAttachDebuggerMetric({
                        telemetryService: this.telemetryService,
                        result: attachResult,
                        attempts,
                        durationMillis: timer.elapsedTime,
                        runtime: this.runtime,
                    })
                },
            })

            if (attachResults.success) {
                await showDebugConsole()
            }
        }
    }
} // end class LocalLambdaRunner

export const makeBuildDir = async (): Promise<string> => {
    const buildDir = await makeTemporaryToolkitFolder()
    ExtensionDisposableFiles.getInstance().addFolder(buildDir)

    return buildDir
}

export function getHandlerRelativePath(params: { codeRoot: string; filePath: string }): string {
    return path.relative(params.codeRoot, path.dirname(params.filePath))
}

export function getRelativeFunctionHandler(params: {
    handlerName: string
    runtime: string
    handlerFileRelativePath: string
}): string {
    // Make function handler relative to baseDir
    let relativeFunctionHandler: string
    if (shouldAppendRelativePathToFunctionHandler(params.runtime)) {
        relativeFunctionHandler = normalizeSeparator(path.join(params.handlerFileRelativePath, params.handlerName))
    } else {
        relativeFunctionHandler = params.handlerName
    }

    return relativeFunctionHandler
}

export async function getLambdaInfoFromExistingTemplate(params: {
    workspaceUri: vscode.Uri
    relativeOriginalFunctionHandler: string
}): Promise<LocalLambda | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(params.workspaceUri)
    let existingLambda: LocalLambda | undefined
    if (workspaceFolder) {
        const lambdas = await detectLocalLambdas([workspaceFolder])
        existingLambda = lambdas.find(lambda => lambda.handler === params.relativeOriginalFunctionHandler)
    }

    return existingLambda
}

export async function makeInputTemplate(params: {
    baseBuildDir: string
    codeDir: string
    relativeFunctionHandler: string
    globals?: CloudFormation.TemplateGlobals
    properties?: CloudFormation.ResourceProperties
    runtime: string
}): Promise<string> {
    let newTemplate = new SamTemplateGenerator()
        .withFunctionHandler(params.relativeFunctionHandler)
        .withResourceName(TEMPLATE_RESOURCE_NAME)
        .withRuntime(params.runtime)
        .withCodeUri(params.codeDir)

    if (params.properties) {
        if (params.properties.Environment) {
            newTemplate = newTemplate.withEnvironment(params.properties.Environment)
        }

        if (params.properties.MemorySize) {
            newTemplate = newTemplate.withMemorySize(params.properties.MemorySize)
        }

        if (params.properties.Timeout) {
            newTemplate = newTemplate.withTimeout(params.properties.Timeout)
        }
    }

    if (params.globals) {
        newTemplate = newTemplate.withGlobals(params.globals)
    }

    const inputTemplatePath: string = path.join(params.baseBuildDir, 'input', 'input-template.yaml')
    ExtensionDisposableFiles.getInstance().addFolder(inputTemplatePath)

    await newTemplate.generate(inputTemplatePath)

    return inputTemplatePath
}

export interface ExecuteSamBuildArguments {
    baseBuildDir: string
    channelLogger: Pick<ChannelLogger, 'info'>
    codeDir: string
    inputTemplatePath: string
    manifestPath?: string
    environmentVariables?: NodeJS.ProcessEnv
    samProcessInvoker: SamCliProcessInvoker
    useContainer?: boolean
}

export async function executeSamBuild({
    baseBuildDir,
    channelLogger,
    codeDir,
    inputTemplatePath,
    manifestPath,
    environmentVariables,
    samProcessInvoker,
    useContainer,
}: ExecuteSamBuildArguments): Promise<string> {
    channelLogger.info('AWS.output.building.sam.application', 'Building SAM Application...')

    const samBuildOutputFolder = path.join(baseBuildDir, 'output')

    const samCliArgs: SamCliBuildInvocationArguments = {
        buildDir: samBuildOutputFolder,
        baseDir: codeDir,
        templatePath: inputTemplatePath,
        invoker: samProcessInvoker,
        manifestPath,
        environmentVariables,
        useContainer,
    }
    await new SamCliBuildInvocation(samCliArgs).execute()

    channelLogger.info('AWS.output.building.sam.application.complete', 'Build complete.')

    return path.join(samBuildOutputFolder, 'template.yaml')
}

export interface InvokeLambdaFunctionArguments {
    baseBuildDir: string
    documentUri: vscode.Uri
    originalHandlerName: string
    handlerName: string
    originalSamTemplatePath: string
    samTemplatePath: string
    runtime: string
    debugArgs?: DebugLambdaFunctionArguments
}

export interface DebugLambdaFunctionArguments {
    debugConfig: DebugConfiguration
    debuggerPath?: string
    debugPort: number
}

export interface InvokeLambdaFunctionContext {
    channelLogger: ChannelLogger
    configuration: SettingsConfiguration
    samLocalInvokeCommand: SamLocalInvokeCommand
    telemetryService: TelemetryService
    onWillAttachDebugger?(debugPort: number, timeout: Timeout, channelLogger: ChannelLogger): Promise<void>
}

export async function invokeLambdaFunction(
    invokeArgs: InvokeLambdaFunctionArguments,
    {
        channelLogger,
        configuration,
        samLocalInvokeCommand,
        telemetryService,
        onWillAttachDebugger,
    }: InvokeLambdaFunctionContext
): Promise<void> {
    channelLogger.info(
        'AWS.output.starting.sam.app.locally',
        'Starting the SAM Application locally (see Terminal for output)'
    )
    getLogger().debug(`localLambdaRunner.invokeLambdaFunction: ${JSON.stringify(invokeArgs, undefined, 2)}`)

    const eventPath: string = path.join(invokeArgs.baseBuildDir, 'event.json')
    const environmentVariablePath = path.join(invokeArgs.baseBuildDir, 'env-vars.json')
    const config = await getHandlerConfig({
        handlerName: invokeArgs.originalHandlerName,
        documentUri: invokeArgs.documentUri,
        samTemplate: vscode.Uri.file(invokeArgs.originalSamTemplatePath),
    })
    const maxRetries: number = getAttachDebuggerMaxRetryLimit(configuration, MAX_DEBUGGER_RETRIES_DEFAULT)

    await writeFile(eventPath, JSON.stringify(config.event || {}))
    await writeFile(environmentVariablePath, JSON.stringify(getEnvironmentVariables(config)))

    const localInvokeArgs: SamCliLocalInvokeInvocationArguments = {
        templateResourceName: TEMPLATE_RESOURCE_NAME,
        templatePath: invokeArgs.samTemplatePath,
        eventPath,
        environmentVariablePath,
        invoker: samLocalInvokeCommand,
        dockerNetwork: config.dockerNetwork,
    }

    const debugArgs = invokeArgs.debugArgs
    if (debugArgs) {
        localInvokeArgs.debugPort = debugArgs.debugPort.toString()
        localInvokeArgs.debuggerPath = debugArgs.debuggerPath
    }
    const command = new SamCliLocalInvokeInvocation(localInvokeArgs)

    const timer = createInvokeTimer(configuration)
    await command.execute(timer)

    if (debugArgs) {
        if (onWillAttachDebugger) {
            messageUserWaitingToAttach(channelLogger)
            await onWillAttachDebugger(debugArgs.debugPort, timer, channelLogger)
        }

        const attachResults = await attachDebugger({
            debugConfig: debugArgs.debugConfig,
            maxRetries,
            retryDelayMillis: ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
            channelLogger,
            onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number): void => {
                recordAttachDebuggerMetric({
                    telemetryService: telemetryService,
                    result: attachResult,
                    attempts,
                    durationMillis: timer.elapsedTime,
                    runtime: invokeArgs.runtime,
                })
            },
        })

        if (attachResults.success) {
            await showDebugConsole()
        }
    }
}

const getEnvironmentVariables = (
    config: Pick<HandlerConfig, 'environmentVariables'>
): SAMTemplateEnvironmentVariables => {
    if (!!config.environmentVariables) {
        return {
            [TEMPLATE_RESOURCE_NAME]: config.environmentVariables,
        }
    } else {
        return {}
    }
}

export interface AttachDebuggerContext {
    debugConfig: DebugConfiguration
    maxRetries: number
    retryDelayMillis?: number
    channelLogger: Pick<ChannelLogger, 'info' | 'error'>
    onStartDebugging?: typeof vscode.debug.startDebugging
    onRecordAttachDebuggerMetric?(attachResult: boolean | undefined, attempts: number): void
    onWillRetry?(): Promise<void>
}

export async function attachDebugger({
    retryDelayMillis = ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
    onStartDebugging = vscode.debug.startDebugging,
    onWillRetry = async (): Promise<void> => {
        await new Promise<void>(resolve => {
            setTimeout(resolve, retryDelayMillis)
        })
    },
    ...params
}: AttachDebuggerContext): Promise<{ success: boolean }> {
    const channelLogger = params.channelLogger
    getLogger().debug(
        `localLambdaRunner.attachDebugger: startDebugging with debugConfig: ${JSON.stringify(
            params.debugConfig,
            undefined,
            2
        )}`
    )

    let isDebuggerAttached: boolean | undefined
    let retries = 0

    channelLogger.info('AWS.output.sam.local.attaching', 'Attaching debugger to SAM Application...')

    do {
        isDebuggerAttached = await onStartDebugging(undefined, params.debugConfig)

        if (isDebuggerAttached === undefined) {
            if (retries < params.maxRetries) {
                if (onWillRetry) {
                    await onWillRetry()
                }
                retries += 1
            } else {
                channelLogger.error(
                    'AWS.output.sam.local.attach.retry.limit.exceeded',
                    'Retry limit reached while trying to attach the debugger.'
                )

                isDebuggerAttached = false
            }
        }
    } while (isDebuggerAttached === undefined)

    if (params.onRecordAttachDebuggerMetric) {
        params.onRecordAttachDebuggerMetric(isDebuggerAttached, retries + 1)
    }

    if (isDebuggerAttached) {
        channelLogger.info('AWS.output.sam.local.attach.success', 'Debugger attached')
    } else {
        channelLogger.error(
            'AWS.output.sam.local.attach.failure',
            // tslint:disable-next-line:max-line-length
            'Unable to attach Debugger. Check the Terminal tab for output. If it took longer than expected to successfully start, you may still attach to it.'
        )
    }

    return {
        success: isDebuggerAttached,
    }
}

export async function waitForDebugPort(
    debugPort: number,
    timeoutDuration: Timeout,
    channelLogger: ChannelLogger
): Promise<void> {
    const remainingTime = timeoutDuration.remainingTime
    try {
        // this function always attempts once no matter the timeoutDuration
        await tcpPortUsed.waitUntilUsed(debugPort, SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS, remainingTime)
    } catch (err) {
        getLogger().warn(`Timed out after ${remainingTime} ms waiting for port ${debugPort} to open: %O`, err as Error)

        channelLogger.warn(
            'AWS.samcli.local.invoke.port.not.open',
            // tslint:disable-next-line:max-line-length
            "The debug port doesn't appear to be open. The debugger might not succeed when attaching to your SAM Application."
        )
    }
}

export interface RecordAttachDebuggerMetricContext {
    telemetryService: Pick<TelemetryService, 'record'>
    runtime: string
    result: boolean | undefined
    attempts: number
    durationMillis: number
}

function recordAttachDebuggerMetric(params: RecordAttachDebuggerMetricContext) {
    recordSamAttachDebugger({
        runtime: params.runtime as Runtime,
        result: params.result ? 'Succeeded' : 'Failed',
        attempts: params.attempts,
        duration: params.durationMillis,
    })
}

function getAttachDebuggerMaxRetryLimit(configuration: SettingsConfiguration, defaultValue: number): number {
    return configuration.readSetting<number>('samcli.debug.attach.retry.maximum', defaultValue)!
}

export function shouldAppendRelativePathToFunctionHandler(runtime: string): boolean {
    // getFamily will throw an error if the runtime doesn't exist
    switch (getFamily(runtime)) {
        case RuntimeFamily.NodeJS:
        case RuntimeFamily.Python:
            return true
        case RuntimeFamily.DotNetCore:
            return false
        // if the runtime exists but for some reason we forgot to cover it here, throw anyway so we remember to cover it
        default:
            throw new Error('localLambdaRunner can not determine if runtime requires a relative path.')
    }
}

function createInvokeTimer(configuration: SettingsConfiguration): Timeout {
    const timelimit = configuration.readSetting<number>(
        'samcli.debug.attach.timeout.millis',
        SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS_DEFAULT
    )

    return new Timeout(timelimit)
}

/**
 * Brings the Debug Console in focus.
 * If the OutputChannel is showing, focus does not consistently switch over to the debug console, so we're
 * helping make this happen.
 */
async function showDebugConsole(): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.debug.action.toggleRepl')
    } catch (err) {
        // in case the vs code command changes or misbehaves, swallow error
        getLogger().verbose('Unable to switch to the Debug Console: %O', err as Error)
    }
}

function messageUserWaitingToAttach(channelLogger: ChannelLogger) {
    channelLogger.info(
        'AWS.output.sam.local.waiting',
        'Waiting for SAM Application to start before attaching debugger...'
    )
}
