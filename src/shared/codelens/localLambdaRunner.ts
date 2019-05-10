/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import { getLocalLambdaConfiguration } from '../../lambda/local/configureLocalLambda'
import { detectLocalLambdas, LocalLambda } from '../../lambda/local/detectLocalLambdas'
import { CloudFormation } from '../cloudformation/cloudformation'
import { writeFile } from '../filesystem'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from '../sam/cli/samCliBuild'
import { SamCliProcessInvoker, SamCliTaskInvoker } from '../sam/cli/samCliInvokerUtils'
import { SamCliLocalInvokeInvocation, SamCliLocalInvokeInvocationArguments } from '../sam/cli/samCliLocalInvoke'
import { SettingsConfiguration } from '../settingsConfiguration'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { ExtensionDisposableFiles } from '../utilities/disposableFiles'

import { generateDefaultHandlerConfig, HandlerConfig } from '../../lambda/config/templates'
import { DebugConfiguration } from '../../lambda/local/debugConfiguration'
import { getFamily, SamLambdaRuntimeFamily } from '../../lambda/models/samLambdaRuntime'
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
        private readonly taskInvoker: SamCliTaskInvoker,
        private readonly debugConfig: DebugConfiguration,
        private readonly codeRootDirectoryPath: string,
        private readonly telemetryService: TelemetryService,
        private readonly onDidSamBuild?: (params: OnDidSamBuildParams) => Promise<void>,
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
        const maxRetries: number = getAttachDebuggerMaxRetryLimit(this.configuration, MAX_DEBUGGER_RETRIES_DEFAULT)

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

            await attachDebugger({
                debugConfig: this.debugConfig,
                maxRetries,
                retryDelayMillis: ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
                channelLogger: this.channelLogger,
                onRecordAttachDebuggerMetric: (
                    attachResult: boolean | undefined, attempts: number, attachResultDate: Date
                ): void => {
                    recordAttachDebuggerMetric({
                        telemetryService: this.telemetryService,
                        result: attachResult,
                        attempts,
                        durationMillis: attachResultDate.getTime() - startInvokeTime.getTime(),
                        runtime: this.runtime,
                    })
                },
            })
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
} // end class LocalLambdaRunner

export const makeBuildDir = async (): Promise<string> => {
    const buildDir = await makeTemporaryToolkitFolder()
    ExtensionDisposableFiles.getInstance().addFolder(buildDir)

    return buildDir
}

export function getHandlerRelativePath(params: {
    codeRoot: string,
    filePath: string
}): string {
    return path.relative(params.codeRoot, path.dirname(params.filePath))
}

export function getRelativeFunctionHandler(params: {
    handlerName: string,
    runtime: string,
    handlerFileRelativePath: string
}): string {
    // Make function handler relative to baseDir
    let relativeFunctionHandler: string
    if (shouldAppendRelativePathToFunctionHandler(params.runtime)) {
        relativeFunctionHandler = normalizeSeparator(
            path.join(
                params.handlerFileRelativePath,
                params.handlerName,
            )
        )
    } else {
        relativeFunctionHandler = params.handlerName
    }

    return relativeFunctionHandler
}

export async function getLambdaInfoFromExistingTemplate(params: {
    workspaceUri: vscode.Uri,
    relativeOriginalFunctionHandler: string
}): Promise <LocalLambda | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(params.workspaceUri)
    let existingLambda: LocalLambda | undefined
    if (workspaceFolder) {
        const lambdas = await detectLocalLambdas([workspaceFolder])
        existingLambda = lambdas.find(lambda => lambda.handler === params.relativeOriginalFunctionHandler)
    }

    return existingLambda
}

export async function makeInputTemplate(params: {
    baseBuildDir: string,
    codeDir: string,
    relativeFunctionHandler: string,
    properties?: CloudFormation.ResourceProperties,
    runtime: string
}): Promise<string> {

    const newTemplate = new SamTemplateGenerator()
        .withFunctionHandler(params.relativeFunctionHandler)
        .withResourceName(TEMPLATE_RESOURCE_NAME)
        .withRuntime(params.runtime)
        .withCodeUri(params.codeDir)
    if (params.properties && params.properties.Environment) {
        newTemplate.withEnvironment(params.properties.Environment)
    }

    const inputTemplatePath: string = path.join(params.baseBuildDir, 'input', 'input-template.yaml')
    ExtensionDisposableFiles.getInstance().addFolder(inputTemplatePath)

    await newTemplate.generate(inputTemplatePath)

    return inputTemplatePath
}

export interface ExecuteSamBuildArguments {
    baseBuildDir: string
    channelLogger: Pick<ChannelLogger, 'info'>,
    codeDir: string,
    inputTemplatePath: string,
    manifestPath?: string,
    environmentVariables?: NodeJS.ProcessEnv,
    samProcessInvoker: SamCliProcessInvoker,
}

export async function executeSamBuild({
    baseBuildDir,
    channelLogger,
    codeDir,
    inputTemplatePath,
    manifestPath,
    environmentVariables,
    samProcessInvoker
}: ExecuteSamBuildArguments): Promise<string> {
    channelLogger.info(
        'AWS.output.building.sam.application',
        'Building SAM Application...'
    )

    const samBuildOutputFolder = path.join(baseBuildDir, 'output')

    const samCliArgs: SamCliBuildInvocationArguments = {
        buildDir: samBuildOutputFolder,
        baseDir: codeDir,
        templatePath: inputTemplatePath,
        invoker: samProcessInvoker,
        manifestPath,
        environmentVariables
    }
    await new SamCliBuildInvocation(samCliArgs).execute()

    channelLogger.info(
        'AWS.output.building.sam.application.complete',
        'Build complete.'
    )

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
    taskInvoker: SamCliTaskInvoker
    telemetryService: TelemetryService
}

export async function invokeLambdaFunction(
    invokeArgs: InvokeLambdaFunctionArguments,
    {
        channelLogger,
        configuration,
        taskInvoker,
        telemetryService
    }: InvokeLambdaFunctionContext
): Promise<void> {
    channelLogger.info(
        'AWS.output.starting.sam.app.locally',
        'Starting the SAM Application locally (see Terminal for output)'
    )
    channelLogger.logger.debug(`localLambdaRunner.invokeLambdaFunction: ${JSON.stringify(invokeArgs, undefined, 2)}`)

    const eventPath: string = path.join(invokeArgs.baseBuildDir, 'event.json')
    const environmentVariablePath = path.join(invokeArgs.baseBuildDir, 'env-vars.json')
    const config = await getConfig({
        handlerName: invokeArgs.originalHandlerName,
        documentUri: invokeArgs.documentUri,
        samTemplate: vscode.Uri.file(invokeArgs.originalSamTemplatePath),
    })
    const maxRetries: number = getAttachDebuggerMaxRetryLimit(configuration, MAX_DEBUGGER_RETRIES_DEFAULT)

    await writeFile(eventPath, JSON.stringify(config.event || {}))
    await writeFile(
        environmentVariablePath,
        JSON.stringify(getEnvironmentVariables(config))
    )

    const localInvokeArgs: SamCliLocalInvokeInvocationArguments = {
        templateResourceName: TEMPLATE_RESOURCE_NAME,
        templatePath: invokeArgs.samTemplatePath,
        eventPath,
        environmentVariablePath,
        invoker: taskInvoker,
    }
    const debugArgs = invokeArgs.debugArgs
    if (debugArgs) {
        localInvokeArgs.debugPort = debugArgs.debugPort.toString()
        localInvokeArgs.debuggerPath = debugArgs.debuggerPath
    }
    const command = new SamCliLocalInvokeInvocation(localInvokeArgs)

    const startInvokeTime = new Date()
    await command.execute()

    if (debugArgs) {
        await waitForDebugPort({
            debugPort: debugArgs.debugPort,
            configuration,
            channelLogger
        })

        await attachDebugger({
            debugConfig: debugArgs.debugConfig,
            maxRetries,
            retryDelayMillis: ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
            channelLogger,
            onRecordAttachDebuggerMetric: (
                attachResult: boolean | undefined, attempts: number, attachResultDate: Date
            ): void => {
                recordAttachDebuggerMetric({
                    telemetryService: telemetryService,
                    result: attachResult,
                    attempts,
                    durationMillis: attachResultDate.getTime() - startInvokeTime.getTime(),
                    runtime: invokeArgs.runtime,
                })
            },
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

const getEnvironmentVariables = (
    config: Pick<HandlerConfig, 'environmentVariables'>
): SAMTemplateEnvironmentVariables => {
    if (!!config.environmentVariables) {
        return {
            [TEMPLATE_RESOURCE_NAME]: config.environmentVariables
        }
    } else {
        return {}
    }
}

export interface AttachDebuggerContext {
    debugConfig: DebugConfiguration
    maxRetries: number
    retryDelayMillis?: number
    channelLogger: Pick<ChannelLogger, 'info' | 'error' | 'logger'>
    onStartDebugging?: typeof vscode.debug.startDebugging
    onRecordAttachDebuggerMetric?(attachResult: boolean | undefined, attempts: number, attachResultDate: Date): void
    onWillRetry?(): Promise<void>
}

export async function attachDebugger(
    {
        retryDelayMillis = ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
        onStartDebugging = vscode.debug.startDebugging,
        onWillRetry = async (): Promise<void> => {
            await new Promise<void>(resolve => {
                setTimeout(resolve, retryDelayMillis)
            })
        },
        ...params
    }: AttachDebuggerContext
): Promise<{ success: boolean }> {
    const channelLogger = params.channelLogger
    const logger = params.channelLogger.logger
    logger.debug(`localLambdaRunner.attachDebugger: startDebugging with debugConfig: ${JSON.stringify(
        params.debugConfig,
        undefined,
        2
    )}`)

    let isDebuggerAttached: boolean | undefined
    let retries = 0

    channelLogger.info(
        'AWS.output.sam.local.attaching',
        'Attaching debugger to SAM Application...',
    )

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
        params.onRecordAttachDebuggerMetric(isDebuggerAttached, retries + 1, new Date())
    }

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

export interface RecordAttachDebuggerMetricContext {
    telemetryService: Pick<TelemetryService, 'record'>
    runtime: string
    result: boolean | undefined
    attempts: number
    durationMillis: number
}

function recordAttachDebuggerMetric(params: RecordAttachDebuggerMetricContext) {
    const currTime = new Date()
    const namespace = params.result ? 'DebugAttachSuccess' : 'DebugAttachFailure'

    const metadata = new Map([
        ['runtime', params.runtime],
    ])

    params.telemetryService.record({
        namespace: namespace,
        createTime: currTime,
        data: [
            {
                name: 'attempts',
                value: params.attempts,
                unit: 'Count',
                metadata,
            },
            {
                name: 'duration',
                value: params.durationMillis,
                unit: 'Milliseconds',
                metadata,
            }
        ]
    })
}

function getAttachDebuggerMaxRetryLimit(
    configuration: SettingsConfiguration,
    defaultValue: number,
): number {
    return configuration.readSetting<number>(
        'samcli.debug.attach.retry.maximum',
        defaultValue
    )!
}

export function shouldAppendRelativePathToFunctionHandler(runtime: string): boolean {
    // getFamily will throw an error if the runtime doesn't exist
    switch (getFamily(runtime)) {
        case SamLambdaRuntimeFamily.NodeJS:
        case SamLambdaRuntimeFamily.Python:
            return true
        case SamLambdaRuntimeFamily.DotNetCore:
            return false
        // if the runtime exists but for some reason we forgot to cover it here, throw anyway so we remember to cover it
        default:
            throw new Error('localLambdaRunner can not determine if runtime requires a relative path.')
    }
}
