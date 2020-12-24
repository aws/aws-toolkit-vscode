/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyFile, readFile, remove, writeFile } from 'fs-extra'
import * as path from 'path'
import * as request from 'request'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getTemplate, getTemplateResource, isImageLambdaConfig } from '../../lambda/local/debugConfiguration'
import { getFamily, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../extensions'
import { getLogger } from '../logger'
import { SettingsConfiguration } from '../settingsConfiguration'
import * as telemetry from '../telemetry/telemetry'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import * as pathutil from '../utilities/pathUtils'
import { normalizeSeparator } from '../utilities/pathUtils'
import { Timeout } from '../utilities/timeoutUtils'
import { tryGetAbsolutePath } from '../utilities/workspaceUtils'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from './cli/samCliBuild'
import { SamCliLocalInvokeInvocation, SamCliLocalInvokeInvocationArguments } from './cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from './debugger/awsSamDebugger'
import { asEnvironmentVariables } from '../../credentials/credentialsUtilities'
import { buildSamCliStartApiArguments } from './cli/samCliStartApi'
import { DefaultSamCliProcessInvoker, DefaultSamCliProcessInvokerContext } from './cli/samCliInvoker'
import { APIGatewayProperties } from './debugger/awsSamDebugConfiguration.gen'
import { ChildProcess } from '../utilities/childProcess'
import { ext } from '../extensionGlobals'

const localize = nls.loadMessageBundle()

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
const MAX_DEBUGGER_RETRIES: number = 4
const ATTACH_DEBUGGER_RETRY_DELAY_MILLIS: number = 1000

/** "sam local start-api" wrapper from the current debug-session. */
let samStartApi: Promise<void>
let samStartApiProc: ChildProcess | undefined

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
        inputTemplatePath = path.join(config.codeRoot, 'app___vsctk___template.yaml')
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
    ctx.outputChannel.show(true)
    if (!config.noDebug) {
        const msg =
            (config.invokeTarget.target === 'api' ? `API "${config.api?.path}", ` : '') +
            `Lambda "${config.handlerName}"`
        getLogger('channel').info(localize('AWS.output.sam.local.startDebug', 'Preparing to debug locally: {0}', msg))
    } else {
        getLogger('channel').info(
            localize('AWS.output.sam.local.startRun', 'Preparing to run locally: {0}', config.handlerName)
        )
    }

    const processInvoker = new DefaultSamCliProcessInvoker()

    getLogger('channel').info(localize('AWS.output.building.sam.application', 'Building SAM application...'))
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
        // SAM_BUILD_MODE: https://github.com/aws/aws-sam-cli/blame/846dfc3e0a8ed12627d554a4f712790a0ddc8b47/designs/build_debug_artifacts.md#L58
        // Needed at least for dotnet case because omnisharp ignores anything 'optimized'
        // and thinks everything is library code; harmless for others.
        // TODO: why doesn't this affect JB Toolkit/Rider?
        samCliArgs.environmentVariables = {
            ...samCliArgs.environmentVariables,
            SAM_BUILD_MODE: 'debug',
        }
    }

    try {
        const samBuild = new SamCliBuildInvocation(samCliArgs)
        await samBuild.execute()
        if (samBuild.failure()) {
            getLogger('debug').error(samBuild.failure()!)
            throw new Error(samBuild.failure())
        }
        // build successful: use output template path for invocation
        // XXX: reassignment
        await remove(config.templatePath)
        config.templatePath = path.join(samBuildOutputFolder, 'template.yaml')
        getLogger('channel').info(localize('AWS.output.building.sam.application.complete', 'Build complete.'))
    } catch (err) {
        // build unsuccessful: don't delete temp template and continue using it for invocation
        // will be cleaned up in the last `finally` step
        getLogger('channel').warn(
            localize('AWS.samcli.build.failedBuild', '"sam build" failed: {0}', config.templatePath)
        )
    }

    await onAfterBuild()

    getLogger('channel').info(localize('AWS.output.starting.sam.app.locally', 'Starting SAM application locally'))
    getLogger().debug(`localLambdaRunner.invokeLambdaFunction: ${config.name}`)

    const timer = createInvokeTimer(ctx.settings)
    const debugPort = !config.noDebug ? config.debugPort?.toString() : undefined
    const lambdaPackageType = isImageLambdaConfig(config) ? 'Image' : 'Zip'

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

        const recordApigwTelemetry = (result: telemetry.Result) => {
            telemetry.recordApigatewayInvokeLocal({
                result: result,
                runtime: config.runtime as telemetry.Runtime,
                debug: !config.noDebug,
                httpMethod: config.api?.httpMethod,
            })
        }

        // We want async behavior so `await` is intentionally not used here, we
        // need to call requestLocalApi() while it is up.
        samStartApi = config
            .samLocalInvokeCommand!.invoke({
                options: {
                    env: {
                        ...process.env,
                        ...envVars,
                    },
                },
                command: samCommand,
                args: samArgs,
                // "sam local start-api" produces "attach" messages similar to "sam local invoke".
                waitForCues: true,
                timeout: timer,
            })
            .then(sam => {
                recordApigwTelemetry('Succeeded')
                samStartApiProc = sam
            })
            .catch(e => {
                recordApigwTelemetry('Failed')
                getLogger().warn(e as Error)
                getLogger('channel').error(
                    localize(
                        'AWS.error.during.apig.local',
                        'Failed to start local API Gateway: {0}',
                        (e as Error).message
                    )
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
            containerEnvFile: config.containerEnvFile,
            extraArgs: config.sam?.localArguments,
            skipPullImage: config.sam?.skipNewImageCheck,
            parameterOverrides: config.parameterOverrides,
        }

        // sam local invoke ...
        const command = new SamCliLocalInvokeInvocation(localInvokeArgs)
        let invokeResult: telemetry.Result = 'Failed'
        try {
            await command.execute(timer)
            invokeResult = 'Succeeded'
        } catch (err) {
            getLogger('channel').error(
                localize(
                    'AWS.error.during.sam.local',
                    'Failed to run SAM application locally: {0}',
                    (err as Error).message
                )
            )
        } finally {
            await remove(config.templatePath)
            telemetry.recordLambdaInvokeLocal({
                lambdaPackageType: lambdaPackageType,
                result: invokeResult,
                runtime: config.runtime as telemetry.Runtime,
                debug: !config.noDebug,
            })
        }
    }

    if (!config.noDebug) {
        if (config.invokeTarget.target === 'api') {
            const payload = JSON.parse(await readFile(config.eventPayloadFile, { encoding: 'utf-8' }))
            // Send the request to the local API server.
            await requestLocalApi(ctx, config.api!, config.apiPort!, payload)
            // Wait for cue messages ("Starting debugger" etc.) before attach.
            await samStartApi
        }

        if (config.onWillAttachDebugger) {
            getLogger('channel').info(
                localize('AWS.output.sam.local.waiting', 'Waiting for SAM application to start...')
            )
            config.onWillAttachDebugger(config.debugPort!, timer)
        }
        // HACK: remove non-serializable properties before attaching.
        // TODO: revisit this :)
        // eslint-disable-next-line @typescript-eslint/unbound-method
        config.onWillAttachDebugger = undefined
        config.samLocalInvokeCommand = undefined

        await attachDebugger({
            debugConfig: config,
            retryDelayMillis: ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
            onRecordAttachDebuggerMetric: (attachResult: boolean | undefined, attempts: number): void => {
                telemetry.recordSamAttachDebugger({
                    lambdaPackageType: lambdaPackageType,
                    runtime: config.runtime as telemetry.Runtime,
                    result: attachResult ? 'Succeeded' : 'Failed',
                    attempts: attempts,
                    duration: timer.elapsedTime,
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
                ext.outputChannel.appendLine(`Failed to debug: ${e}`)
            })
    }

    return config
}

function stopApi(config: vscode.DebugConfiguration) {
    if (!samStartApiProc) {
        getLogger().error('SAM: unknown debug session: %s', config.name)
        return
    }

    try {
        getLogger().verbose('SAM: sending SIGHUP to sam process: pid %d', samStartApiProc.pid())
        samStartApiProc.stop(true, 'SIGHUP')
    } catch (e) {
        getLogger().warn('SAM: failed to stop sam process: pid %d: %O', samStartApiProc.pid(), e as Error)
    } finally {
        samStartApiProc = undefined
    }
}

vscode.debug.onDidTerminateDebugSession(session => {
    const config = session.configuration as SamLaunchRequestArgs
    if (config.invokeTarget?.target === 'api') {
        stopApi(config)
    }
})

/**
 * Sends an HTTP request to the local API webserver, which invokes the backing
 * Lambda, which will then enter debugging.
 */
function requestLocalApi(ctx: ExtContext, api: APIGatewayProperties, apiPort: number, payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const reqMethod = api?.httpMethod?.toUpperCase() ?? 'GET'
        const reqOpts = {
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
        getLogger('channel').info(
            localize('AWS.sam.localApi.request', 'Sending request to local API: {0}', reqOpts.uri)
        )

        const retryRequest = async (retries: number, retriesRemaining: number) => {
            if (retriesRemaining !== retries) {
                await new Promise<void>(r => setTimeout(r, 200))
            }
            request(reqOpts)
                .on('response', resp => {
                    getLogger().debug('Local API response: %s : %O', reqOpts.uri, JSON.stringify(resp))
                    if (resp.statusCode === 403) {
                        const msg = `Local API failed to respond to path: ${api?.path}`
                        getLogger().error(msg)
                        reject(msg)
                    } else {
                        resolve()
                    }
                })
                .on('complete', () => {
                    resolve()
                })
                .on('error', e => {
                    const code = (e as any).code
                    if (code === 'ESOCKETTIMEDOUT') {
                        // HACK: request timeout (as opposed to ECONNREFUSED)
                        // is a hint that debugger is attached, so we can stop requesting now.
                        getLogger().info('Local API is alive (code: %s): %s', code, reqOpts.uri)
                        resolve()
                        return
                    }
                    getLogger().debug(
                        `Local API: retry (${retries - retriesRemaining} of ${retries}): ${reqOpts.uri}: ${e.name}`
                    )
                    if (retriesRemaining > 0) {
                        retryRequest(retries, retriesRemaining - 1)
                    } else {
                        // Timeout: local APIGW took too long to respond.
                        const msg = `Local API failed to respond (${code}) after ${retries} retries, path: ${api?.path}`
                        getLogger().error(msg)
                        reject(msg)
                    }
                })
        }
        retryRequest(30, 30)
    })
}

export interface AttachDebuggerContext {
    debugConfig: SamLaunchRequestArgs
    retryDelayMillis?: number
    onStartDebugging?: typeof vscode.debug.startDebugging
    onRecordAttachDebuggerMetric?(attachResult: boolean | undefined, attempts: number): void
    onWillRetry?(): Promise<void>
}

export async function attachDebugger({
    retryDelayMillis = ATTACH_DEBUGGER_RETRY_DELAY_MILLIS,
    onStartDebugging = vscode.debug.startDebugging,
    onWillRetry = async (): Promise<void> => {
        getLogger().debug('attachDebugger: retrying...')
        await new Promise<void>(resolve => {
            setTimeout(resolve, retryDelayMillis)
        })
    },
    ...params
}: AttachDebuggerContext): Promise<{ success: boolean }> {
    getLogger().debug(
        `localLambdaRunner.attachDebugger: startDebugging with config: ${JSON.stringify(
            params.debugConfig,
            undefined,
            2
        )}`
    )

    let isDebuggerAttached = false
    let retries = 0

    getLogger('channel').info(localize('AWS.output.sam.local.attaching', 'Attaching debugger to SAM application...'))

    do {
        isDebuggerAttached = await onStartDebugging(undefined, params.debugConfig)
        if (!isDebuggerAttached) {
            if (retries < MAX_DEBUGGER_RETRIES) {
                if (onWillRetry) {
                    await onWillRetry()
                }
                retries += 1
            } else {
                getLogger('channel').error(
                    localize(
                        'AWS.output.sam.local.attach.retry.limit.exceeded',
                        'Retry limit reached while trying to attach the debugger.'
                    )
                )
                break
            }
        }
    } while (!isDebuggerAttached)

    if (params.onRecordAttachDebuggerMetric) {
        params.onRecordAttachDebuggerMetric(isDebuggerAttached, retries + 1)
    }

    if (isDebuggerAttached) {
        getLogger('channel').info(localize('AWS.output.sam.local.attach.success', 'Debugger attached'))
        getLogger().verbose(
            `SAM: debug session: "${vscode.debug.activeDebugSession?.name}" / ${vscode.debug.activeDebugSession?.id}`
        )
    } else {
        getLogger('channel').error(
            localize(
                'AWS.output.sam.local.attach.failure',
                'Unable to attach Debugger. Check AWS Toolkit logs. If it took longer than expected to start, you can still attach.'
            )
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
 * @param isDebugPort  Is this a debugger port or a `sam local start-api` HTTP port?
 */
export async function waitForPort(port: number, timeout: Timeout, isDebugPort: boolean = true): Promise<void> {
    const time = timeout.remainingTime
    try {
        // this function always attempts once no matter the timeoutDuration
        await tcpPortUsed.waitUntilUsed(port, SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS, time)
    } catch (err) {
        getLogger().warn(`Timeout after ${time} ms: port was not used: ${port}`)
        if (isDebugPort) {
            getLogger('channel').warn(
                localize('AWS.samcli.local.invoke.portUnavailable', 'Failed to use debugger port: {0}', port.toString())
            )
        } else {
            getLogger('channel').warn(
                localize('AWS.apig.portUnavailable', 'Failed to use API port: {0}', port.toString())
            )
        }
    }
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
export async function makeJsonFiles(config: SamLaunchRequestArgs): Promise<void> {
    config.eventPayloadFile = path.join(config.baseBuildDir!, 'event.json')
    config.envFile = path.join(config.baseBuildDir!, 'env-vars.json')

    // env-vars.json (NB: effectively ignored for the `target=code` case).
    const env = JSON.stringify(getEnvironmentVariables(makeResourceName(config), config.lambda?.environmentVariables))
    await writeFile(config.envFile, env)

    // container-env-vars.json
    if (config.containerEnvVars) {
        config.containerEnvFile = path.join(config.baseBuildDir!, 'container-env-vars.json')
        const containerEnv = JSON.stringify(config.containerEnvVars)
        await writeFile(config.containerEnvFile, containerEnv)
    }

    // event.json
    const payloadObj = config.lambda?.payload?.json ?? config.api?.payload?.json
    const payloadPath = config.lambda?.payload?.path ?? config.api?.payload?.path
    if (payloadPath) {
        const fullpath = tryGetAbsolutePath(config.workspaceFolder, payloadPath)
        try {
            JSON.parse(await readFile(fullpath, { encoding: 'utf-8' }))
        } catch (e) {
            throw Error(`Invalid JSON in payload file: ${payloadPath}`)
        }
        await copyFile(fullpath, config.eventPayloadFile)
    } else {
        await writeFile(config.eventPayloadFile, JSON.stringify(payloadObj || {}))
    }
}
