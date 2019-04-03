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

export async function getRuntimeForLambda(params: {
    handlerName: string,
    templatePath: string,
}): Promise<string> {
    const samTemplateData: CloudFormation.Template = await CloudFormation.load(params.templatePath)
    if (!samTemplateData.Resources) {
        throw new Error(
            `Please specify Resource for '${params.handlerName}' Lambda in SAM template: '${params.templatePath}'`
        )
    }
    const runtimes = new Set<string>()
    for (const resourceKey in samTemplateData.Resources) {
        if (samTemplateData.Resources.hasOwnProperty(resourceKey)) {
            const resource: CloudFormation.Resource | undefined = samTemplateData.Resources[resourceKey]
            if (!resource) {
                continue
            }
            if (resource.Type === 'AWS::Serverless::Function') {
                if (!resource.Properties) {
                    continue
                }
                if (resource.Properties.Runtime) {
                    if (resource.Properties.Handler === params.handlerName) {
                        return resource.Properties.Runtime
                    } else {
                        runtimes.add(resource.Properties.Runtime)
                    }
                }

            }
        }
    }
    if (runtimes.size === 1) {
        // If all lambdas have the same runtime... assume that will continue to be the case
        return Array.from(runtimes)[0]
    }
    throw new Error(
        `Please specify runtime for '${params.handlerName}' Lambda in SAM template: '${params.templatePath}'`
    )
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
    const maxRetries: number = getAttachDebuggerMaxRetryLimit(params.configuration, MAX_DEBUGGER_RETRIES_DEFAULT)

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

        await attachDebugger({
            debugConfig: params.debugConfig,
            maxRetries,
            retryDelayMillis: ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
            channelLogger: params.channelLogger,
            onRecordAttachDebuggerMetric: (
                attachResult: boolean | undefined, attempts: number, attachResultDate: Date
            ): void => {
                recordAttachDebuggerMetric({
                    telemetryService: params.telemetryService,
                    result: attachResult,
                    attempts,
                    durationMillis: attachResultDate.getTime() - startInvokeTime.getTime(),
                    runtime: params.runtime,
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

const getEnvironmentVariables = (config: HandlerConfig): SAMTemplateEnvironmentVariables => {
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
