/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyFile, unlink, readFile, writeFile } from 'fs-extra'
import * as path from 'path'
import * as request from 'request'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import { getTemplate, getTemplateResource } from '../../lambda/local/debugConfiguration'
import { getFamily, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../extensions'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import * as pathutils from '../../shared/utilities/pathUtils'
import { getLogger } from '../logger'
import { SettingsConfiguration } from '../settingsConfiguration'
import { recordLambdaInvokeLocal, Result, Runtime, recordSamAttachDebugger } from '../telemetry/telemetry'
import * as telemetry from '../telemetry/telemetry'
import { TelemetryService } from '../telemetry/telemetryService'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { ExtensionDisposableFiles } from '../utilities/disposableFiles'
import * as pathutil from '../utilities/pathUtils'
import { normalizeSeparator } from '../utilities/pathUtils'
import { Timeout } from '../utilities/timeoutUtils'
import { ChannelLogger } from '../utilities/vsCodeUtils'
import { tryGetAbsolutePath } from '../utilities/workspaceUtils'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from './cli/samCliBuild'
import { SamCliLocalInvokeInvocation, SamCliLocalInvokeInvocationArguments } from './cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from './debugger/awsSamDebugger'
import { asEnvironmentVariables } from '../../credentials/credentialsUtilities'
import { buildSamCliStartApiArguments } from './cli/samCliStartApi'
import { DefaultSamCliProcessInvoker, DefaultSamCliProcessInvokerContext } from './cli/samCliInvoker'
import { APIGatewayProperties } from './debugger/awsSamDebugConfiguration.gen'

// TODO: remove this and all related code.
export interface LambdaLocalInvokeParams {
    /** URI of the current editor document. */
    uri: vscode.Uri
    handlerName: string
    isDebug: boolean
    workspaceFolder: vscode.WorkspaceFolder
    samTemplate: vscode.Uri
    samTemplateResourceName: string | undefined
}

export interface SAMTemplateEnvironmentVariables {
    [resource: string]: {
        [k: string]: string | number | boolean
    }
}

function getEnvironmentVariables(
    resourceName: string,
    env?: { [k: string]: string | number | boolean }
): SAMTemplateEnvironmentVariables {
    return env ? { [resourceName]: env } : {}
}

/**
 * Decides the resource name for the generated template.yaml.
 */
function makeResourceName(config: SamLaunchRequestArgs): string {
    return config.invokeTarget.target === 'code' ? 'awsToolkitSamLocalResource' : config.invokeTarget.logicalId
}

const SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS: number = 125
const SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS_DEFAULT: number = 30000
const MAX_DEBUGGER_RETRIES_DEFAULT: number = 30
const ATTACH_DEBUGGER_RETRY_DELAY_MILLIS: number = 200

export function getRelativeFunctionHandler(params: {
    handlerName: string
    runtime: string
    handlerRelativePath: string
}): string {
    // Make function handler relative to baseDir
    let relativeFunctionHandler: string
    if (shouldAppendRelativePathToFunctionHandler(params.runtime)) {
        relativeFunctionHandler = normalizeSeparator(path.join(params.handlerRelativePath, params.handlerName))
    } else {
        relativeFunctionHandler = params.handlerName
    }

    return relativeFunctionHandler
}

export async function makeInputTemplate(config: SamLaunchRequestArgs): Promise<string> {
    let newTemplate: SamTemplateGenerator
    let inputTemplatePath: string
    const resourceName = makeResourceName(config)

    // use existing template to create a temporary template
    if (['api', 'template'].includes(config.invokeTarget.target)) {
        const template = getTemplate(config.workspaceFolder, config)
        const templateResource = getTemplateResource(config.workspaceFolder, config)

        if (!template || !templateResource) {
            throw new Error('Resource not found in base template')
        }

        // We make a copy as to not mutate the template registry version
        // TODO remove the template registry? make it return non-mutatable things?
        const templateClone = { ...template }

        // TODO fix this API, withTemplateResources is required (with a runtime error), but if we pass in a template why do we need it?
        newTemplate = new SamTemplateGenerator(templateClone).withTemplateResources(templateClone.Resources!)

        // template type uses the template dir and a throwaway template name so we can use existing relative paths
        // clean this one up manually; we don't want to accidentally delete the workspace dir
        inputTemplatePath = path.join(path.dirname(config.templatePath), 'app___vsctk___template.yaml')
    } else {
        // code type - generate ephemeral SAM template
        newTemplate = new SamTemplateGenerator()
            .withFunctionHandler(config.handlerName)
            .withResourceName(resourceName)
            .withRuntime(config.runtime)
            .withCodeUri(config.codeRoot)
        if (config.lambda?.environmentVariables) {
            newTemplate = newTemplate.withEnvironment({
                Variables: config.lambda?.environmentVariables,
            })
        }
        inputTemplatePath = path.join(config.baseBuildDir!, 'input', 'input-template.yaml')
        // code type is fire-and-forget so we can add to disposable files
        ExtensionDisposableFiles.getInstance().addFolder(inputTemplatePath)
    }

    // additional overrides
    if (config.lambda?.memoryMb) {
        newTemplate = newTemplate.withMemorySize(config.lambda?.memoryMb)
    }
    if (config.lambda?.timeoutSec) {
        newTemplate = newTemplate.withTimeout(config.lambda?.timeoutSec)
    }

    await newTemplate.generate(inputTemplatePath)

    return pathutil.normalize(inputTemplatePath)
}

/**
 * Prepares and invokes a lambda function via `sam local invoke`.
 *
 * @param ctx
 * @param config
 * @param onAfterBuild  Called after `SamCliBuildInvocation.execute()`
 */
export async function invokeLambdaFunction(
    ctx: ExtContext,
    config: SamLaunchRequestArgs,
    onAfterBuild: () => Promise<void>
): Promise<SamLaunchRequestArgs> {
    // Switch over to the output channel so the user has feedback that we're getting things ready
    ctx.chanLogger.channel.show(true)
    if (!config.noDebug) {
        const msg =
            (config.invokeTarget.target === 'api' ? `API "${config.api?.path}", ` : '') +
            `Lambda "${config.handlerName}"`
        ctx.chanLogger.info('AWS.output.sam.local.startDebug', 'Preparing to debug locally: {0}', msg)
    } else {
        ctx.chanLogger.info('AWS.output.sam.local.startRun', 'Preparing to run locally: {0}', config.handlerName)
    }

    const processInvoker = new DefaultSamCliProcessInvoker()

    ctx.chanLogger.info('AWS.output.building.sam.application', 'Building SAM Application...')
    const samBuildOutputFolder = path.join(config.baseBuildDir!, 'output')
    const envVars = {
        ...(config.awsCredentials ? asEnvironmentVariables(config.awsCredentials) : {}),
        ...(config.aws?.region ? { AWS_DEFAULT_REGION: config.aws.region } : {}),
    }
    const samCliArgs: SamCliBuildInvocationArguments = {
        buildDir: samBuildOutputFolder,
        // undefined triggers SAM to use the template's dir as the code root
        baseDir: config.invokeTarget.target === 'code' ? config.codeRoot : undefined,
        templatePath: config.templatePath!,
        invoker: processInvoker,
        manifestPath: config.manifestPath,
        environmentVariables: envVars,
        useContainer: config.sam?.containerBuild || false,
        extraArgs: config.sam?.buildArguments,
        skipPullImage: config.sam?.skipNewImageCheck,
        parameterOverrides: config.parameterOverrides,
    }
    if (!config.noDebug) {
        // Needed at least for dotnet case; harmless for others.
        samCliArgs.environmentVariables = {
            ...samCliArgs.environmentVariables,
            SAM_BUILD_MODE: 'debug',
        }
    }

    try {
        await new SamCliBuildInvocation(samCliArgs).execute()
    } finally {
        // always delete temp template.
        await unlink(config.templatePath)
    }

    ctx.chanLogger.info('AWS.output.building.sam.application.complete', 'Build complete.')

    // XXX: reassignment
    config.templatePath = path.join(samBuildOutputFolder, 'template.yaml')

    await onAfterBuild()

    ctx.chanLogger.info(
        'AWS.output.starting.sam.app.locally',
        'Starting the SAM Application locally (see Terminal for output)'
    )
    getLogger().debug(`localLambdaRunner.invokeLambdaFunction: ${config.name}`)

    const maxRetries: number = getAttachDebuggerMaxRetryLimit(ctx.settings, MAX_DEBUGGER_RETRIES_DEFAULT)
    const timer = createInvokeTimer(ctx.settings)
    const debugPort = !config.noDebug ? config.debugPort?.toString() : undefined

    if (config.invokeTarget.target === 'api') {
        // sam local start-api ...
        const samCliContext = new DefaultSamCliProcessInvokerContext()
        const sam = await samCliContext.cliConfig.getOrDetectSamCli()
        if (!sam.path) {
            getLogger().warn('SAM CLI not found and not configured')
        } else if (sam.autoDetected) {
            getLogger().info('SAM CLI not configured, using SAM found at: %O', sam.path)
        }
        const samCommand = sam.path ? sam.path : 'sam'
        const samArgs = await buildSamCliStartApiArguments({
            templatePath: config.templatePath,
            dockerNetwork: config.sam?.dockerNetwork,
            environmentVariablePath: config.envFile,
            environmentVariables: envVars,
            port: config.apiPort?.toString(),
            debugPort: debugPort,
            debuggerPath: config.debuggerPath,
            debugArgs: config.debugArgs,
            skipPullImage: config.sam?.skipNewImageCheck,
            parameterOverrides: config.parameterOverrides,
            extraArgs: config.sam?.localArguments,
        })

        function recordApigwTelemetry(result: telemetry.Result) {
            telemetry.recordApigatewayInvokeLocal({
                result: result,
                runtime: config.runtime as Runtime,
                debug: !config.noDebug,
                httpMethod: config.api?.httpMethod,
            })
        }

        config
            .samLocalInvokeCommand!.invoke({
                options: {
                    env: {
                        ...process.env,
                        ...envVars,
                    },
                },
                command: samCommand,
                args: samArgs,
                isDebug: !config.noDebug,
                timeout: timer,
            })
            .then(r => {
                recordApigwTelemetry('Succeeded')
            })
            .catch(e => {
                recordApigwTelemetry('Failed')
                getLogger().warn(e as Error)
                ctx.chanLogger.error(
                    'AWS.error.during.apig.local',
                    'Failed to start local API Gateway: {0}',
                    e as Error
                )
            })
    } else {
        // 'target=code' or 'target=template'
        const localInvokeArgs: SamCliLocalInvokeInvocationArguments = {
            templateResourceName: makeResourceName(config),
            templatePath: config.templatePath,
            eventPath: config.eventPayloadFile,
            environmentVariablePath: config.envFile,
            environmentVariables: envVars,
            invoker: config.samLocalInvokeCommand!,
            dockerNetwork: config.sam?.dockerNetwork,
            debugPort: debugPort,
            debuggerPath: config.debuggerPath,
            debugArgs: config.debugArgs,
            extraArgs: config.sam?.localArguments,
            skipPullImage: config.sam?.skipNewImageCheck,
            parameterOverrides: config.parameterOverrides,
        }
        delete config.invokeTarget // Must not be used beyond this point.
        // sam local invoke ...
        const command = new SamCliLocalInvokeInvocation(localInvokeArgs)
        let invokeResult: Result = 'Failed'
        try {
            await command.execute(timer)
            invokeResult = 'Succeeded'
        } catch (err) {
            ctx.chanLogger.error(
                'AWS.error.during.sam.local',
                'Failed to run SAM Application locally: {0}',
                err as Error
            )
        } finally {
            recordLambdaInvokeLocal({
                result: invokeResult,
                runtime: config.runtime as Runtime,
                debug: !config.noDebug,
            })
        }
    }

    if (!config.noDebug) {
        if (config.onWillAttachDebugger) {
            ctx.chanLogger.info('AWS.output.sam.local.waiting', 'Waiting for SAM application to start...')
            config.onWillAttachDebugger(config.debugPort!, timer, ctx.chanLogger)
        }
    }
    // HACK: remove non-serializable properties before attaching.
    // TODO: revisit this :)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = undefined
    config.samLocalInvokeCommand = undefined

    if (!config.noDebug) {
        const tryAttach = attachDebugger({
            debugConfig: config,
            maxRetries,
            retryDelayMillis: ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
            channelLogger: ctx.chanLogger,
            onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number): void => {
                recordAttachDebuggerMetric({
                    telemetryService: ctx.telemetryService,
                    result: attachResult,
                    attempts,
                    durationMillis: timer.elapsedTime,
                    runtime: config.runtime,
                })
            },
        })
            .then(r => {
                if (r.success) {
                    showDebugConsole()
                }
            })
            .catch(e => {
                getLogger().error(`Failed to debug: ${e}`)
                ctx.chanLogger.channel.appendLine(`Failed to debug: ${e}`)
            })

        if (config.invokeTarget.target !== 'api') {
            await tryAttach
        } else {
            const payload = JSON.parse(await readFile(config.eventPayloadFile, { encoding: 'utf-8' }))
            await requestLocalApi(ctx, config.api!, config.apiPort!, payload)
            const timer2 = createInvokeTimer(ctx.settings)
            await waitForPort(config.apiPort!, timer2, ctx.chanLogger, false)
            await tryAttach
        }
    }

    return config
}

/**
 * Sends an HTTP request to the local API webserver, which invokes the backing
 * Lambda, which will then enter debugging.
 */
function requestLocalApi(ctx: ExtContext, api: APIGatewayProperties, apiPort: number, payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const reqMethod = api?.httpMethod?.toUpperCase() ?? 'GET'
        let reqOpts = {
            // Sets body to JSON value and adds Content-type: application/json header.
            json: true,
            uri: `http://127.0.0.1:${apiPort}${api?.path}`,
            method: reqMethod,
            timeout: 4000,
            headers: api?.headers,
            body: payload,
            qs: api?.querystring,
            // TODO: api?.stageVariables,
        }
        ctx.chanLogger.info('AWS.sam.localApi.request', `Sending request to local API: ${reqOpts.uri}`)

        async function retryRequest(retries: number, retriesRemaining: number) {
            if (retriesRemaining !== retries) {
                await new Promise<void>(r => setTimeout(r, 200))
            }
            request(reqOpts)
                .on('response', resp => {
                    getLogger().debug('Response from local API: %O: %O', reqOpts.uri, JSON.stringify(resp))
                    resolve()
                })
                .on('complete', () => {
                    resolve()
                })
                .on('error', e => {
                    if ((e as any).code === 'ESOCKETTIMEDOUT') {
                        // HACK: request timeout (as opposed to ECONNREFUSED)
                        // is a hint that debugger is attached, so we can stop requesting now.
                        getLogger().debug('Request failed, local API: %O: %O', reqOpts.uri, e)
                        resolve()
                        return
                    }
                    getLogger().debug(
                        `Retrying request (${retries - retriesRemaining} of ${retries}), local API: ${reqOpts.uri}: ${
                            e.name
                        }`
                    )
                    if (retriesRemaining > 0) {
                        retryRequest(retries, retriesRemaining - 1)
                    } else {
                        // Timeout: local APIGW took too long to respond.
                        reject(`Local API failed to respond (wrong path?): ${api?.path}`)
                    }
                })
        }
        retryRequest(30, 30)
    })
}

export interface AttachDebuggerContext {
    debugConfig: SamLaunchRequestArgs
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
            'Unable to attach Debugger. Check the Terminal tab for output. If it took longer than expected to successfully start, you may still attach to it.'
        )
    }

    return {
        success: isDebuggerAttached,
    }
}

/**
 * Waits for a port to be in use.
 *
 * @param port  Port number to wait for
 * @param timeout  Time to wait
 * @param channelLogger  Logger
 * @param isDebugPort  Is this a debugger port or a `sam local start-api` HTTP port?
 */
export async function waitForPort(
    port: number,
    timeout: Timeout,
    channelLogger: ChannelLogger,
    isDebugPort: boolean = true
): Promise<void> {
    const remainingTime = timeout.remainingTime
    try {
        // this function always attempts once no matter the timeoutDuration
        await tcpPortUsed.waitUntilUsed(port, SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS, remainingTime)
    } catch (err) {
        getLogger().warn(`Timed out after ${remainingTime} ms waiting for port ${port} to open: %O`, err as Error)
        if (isDebugPort) {
            channelLogger.warn(
                'AWS.samcli.local.invoke.portUnavailable',
                'Port {0} is unavailable. Debugger may fail to attach.',
                port.toString()
            )
        } else {
            channelLogger.warn('AWS.apig.portUnavailable', 'Port is unavailable: {0}', port.toString())
        }
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

/**
 * Common logic shared by `makeCsharpConfig`, `makeTypescriptConfig`, `makePythonDebugConfig`.
 *
 * Rules for environment variables:
 *  - SAM implicitly ignores envvars present in `env-vars.json` but absent in `input-template.yaml`.
 *  - Do NOT merge envvars from template.yaml and `lambda.environmentVariables`.
 *  - For `target=template`:
 *    1. Pass envvars from `template.yaml` to the temporary `input-template.yaml` (see `makeInputTemplate()`).
 *    2. Pass envvars from `lambda.environmentVariables` to `env-vars.json` (consumed by SAM).
 *  - For `target=code`:
 *    1. Pass envvars from `lambda.environmentVariables` to `input-template.yaml` (see `makeInputTemplate()`).
 *    2. Does not use `env-vars.json`.
 *
 * @param config
 */
export async function makeConfig(config: SamLaunchRequestArgs): Promise<void> {
    // TODO is this normalize actually needed for any platform?
    config.baseBuildDir = pathutils.normalize(await makeTemporaryToolkitFolder())
    config.eventPayloadFile = path.join(config.baseBuildDir!, 'event.json')
    config.envFile = path.join(config.baseBuildDir!, 'env-vars.json')

    // env-vars.json (NB: effectively ignored for the `target=code` case).
    const env = JSON.stringify(getEnvironmentVariables(makeResourceName(config), config.lambda?.environmentVariables))
    await writeFile(config.envFile, env)

    // event.json
    const payloadObj = config.lambda?.payload?.json ?? config.api?.payload?.json
    const payloadPath = config.lambda?.payload?.path ?? config.api?.payload?.path
    if (payloadPath) {
        const fullpath = tryGetAbsolutePath(config.workspaceFolder, payloadPath)
        try {
            JSON.parse(await readFile(payloadPath, { encoding: 'utf-8' }))
        } catch (e) {
            throw Error(`Invalid JSON in payload file: ${payloadPath}`)
        }
        await copyFile(fullpath, config.eventPayloadFile)
    } else {
        await writeFile(config.eventPayloadFile, JSON.stringify(payloadObj || {}))
    }
}
