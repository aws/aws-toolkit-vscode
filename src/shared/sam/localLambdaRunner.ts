/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as pathutil from '../utilities/pathUtils'
import got, { OptionsOfTextResponseBody, RequestError } from 'got'
import { copyFile, readFile, remove, writeFile } from 'fs-extra'
import { isImageLambdaConfig } from '../../lambda/local/debugConfiguration'
import { getFamily, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../extensions'
import { getLogger } from '../logger'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { Timeout } from '../utilities/timeoutUtils'
import { tryGetAbsolutePath } from '../utilities/workspaceUtils'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from './cli/samCliBuild'
import { SamCliLocalInvokeInvocation, SamCliLocalInvokeInvocationArguments } from './cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from './debugger/awsSamDebugger'
import { asEnvironmentVariables } from '../../auth/credentials/utils'
import { buildSamCliStartApiArguments } from './cli/samCliStartApi'
import { DefaultSamCliProcessInvoker } from './cli/samCliInvoker'
import { APIGatewayProperties } from './debugger/awsSamDebugConfiguration.gen'
import { ChildProcess } from '../utilities/childProcess'
import { SamCliSettings } from './cli/samCliSettings'
import * as CloudFormation from '../cloudformation/cloudformation'
import { sleep } from '../utilities/timeoutUtils'
import { showMessageWithCancel } from '../utilities/messages'
import { ToolkitError, UnknownError } from '../errors'
import { SamCliError } from './cli/samCliInvokerUtils'

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
    if (config.invokeTarget.target === 'code') {
        // CodeUri may be ".", we need a name. #1685
        const fullPath = tryGetAbsolutePath(config.workspaceFolder, config.invokeTarget.projectRoot)
        const logicalId = CloudFormation.makeResourceId(path.parse(fullPath).name)
        return logicalId === ''
            ? 'resource1' // projectRoot has only non-alphanumeric chars :(
            : logicalId
    } else {
        return config.invokeTarget.logicalId
    }
}

const samLocalPortCheckRetryIntervalMillis: number = 125
const attachDebuggerRetryDelayMillis: number = 1000

export function getInputTemplatePath(config: SamLaunchRequestArgs & { invokeTarget: { target: 'code' } }): string {
    const inputTemplatePath: string = path.join(config.baseBuildDir!, 'app___vsctk___template.yaml')

    return pathutil.normalize(inputTemplatePath)
}

export async function makeInputTemplate(
    config: SamLaunchRequestArgs & { invokeTarget: { target: 'code' } }
): Promise<void> {
    let newTemplate: SamTemplateGenerator
    const inputTemplatePath: string = config.templatePath
    const resourceName = makeResourceName(config)

    // code type - generate ephemeral SAM template
    newTemplate = new SamTemplateGenerator()
        .withFunctionHandler(config.invokeTarget.lambdaHandler)
        .withResourceName(resourceName)
        .withRuntime(config.lambda!.runtime!)
        .withCodeUri(pathutil.normalize(config.invokeTarget.projectRoot))

    if (config.lambda?.environmentVariables && Object.entries(config.lambda?.environmentVariables).length) {
        newTemplate = newTemplate.withEnvironment({
            Variables: config.lambda?.environmentVariables,
        })
    }

    // additional overrides
    if (config.lambda?.memoryMb) {
        newTemplate = newTemplate.withMemorySize(config.lambda?.memoryMb)
    }
    if (config.lambda?.timeoutSec) {
        newTemplate = newTemplate.withTimeout(config.lambda?.timeoutSec)
    }
    if (config.invokeTarget.architecture) {
        newTemplate = newTemplate.withArchitectures([config.invokeTarget.architecture])
    }

    await newTemplate.generate(inputTemplatePath)
}

async function buildLambdaHandler(
    timer: Timeout,
    env: NodeJS.ProcessEnv,
    config: SamLaunchRequestArgs,
    settings: SamCliSettings
): Promise<string> {
    const processInvoker = new DefaultSamCliProcessInvoker(settings)

    getLogger('channel').info(localize('AWS.output.building.sam.application', 'Building SAM application...'))
    const samBuildOutputFolder = path.join(config.baseBuildDir!, 'output')

    const samCliArgs: SamCliBuildInvocationArguments = {
        buildDir: samBuildOutputFolder,
        // undefined triggers SAM to use the template's dir as the code root
        baseDir: config.invokeTarget.target === 'code' ? config.codeRoot : undefined,
        templatePath: config.templatePath!,
        invoker: processInvoker,
        manifestPath: config.manifestPath,
        environmentVariables: env,
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

    const samBuild = new SamCliBuildInvocation(samCliArgs)
    const err = await samBuild
        .execute(timer)
        .then(() => {})
        .catch(e => UnknownError.cast(e))
    const failure = err ?? samBuild.failure()
    if (failure) {
        // TODO(sijaden): ask SAM CLI for a way to map exit codes to error codes
        if (typeof failure === 'string') {
            throw new ToolkitError(failure, { code: 'BuildFailure' })
        } else {
            const msg = `SAM build failed${err instanceof SamCliError ? ': ' + err.message : ''}`
            throw ToolkitError.chain(err, msg, { code: 'BuildFailure' })
        }
    }
    getLogger('channel').info(localize('AWS.output.building.sam.application.complete', 'Build complete.'))

    return path.join(samBuildOutputFolder, 'template.yaml')
}

async function invokeLambdaHandler(
    timer: Timeout,
    env: NodeJS.ProcessEnv,
    config: SamLaunchRequestArgs,
    settings: SamCliSettings
): Promise<ChildProcess> {
    getLogger('channel').info(localize('AWS.output.starting.sam.app.locally', 'Starting SAM application locally'))
    getLogger().debug(`localLambdaRunner.invokeLambdaFunction: ${config.name}`)

    const debugPort = !config.noDebug ? config.debugPort?.toString() : undefined

    if (config.invokeTarget.target === 'api') {
        // sam local start-api ...
        const sam = await settings.getOrDetectSamCli()
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
            environmentVariables: env,
            port: config.apiPort?.toString(),
            debugPort: debugPort,
            debuggerPath: config.debuggerPath,
            debugArgs: config.debugArgs,
            skipPullImage: config.sam?.skipNewImageCheck,
            parameterOverrides: config.parameterOverrides,
            containerEnvFile: config.containerEnvFile,
            extraArgs: config.sam?.localArguments,
            name: config.name,
        })

        return config
            .samLocalInvokeCommand!.invoke({
                options: {
                    env: {
                        ...process.env,
                        ...env,
                    },
                },
                command: samCommand,
                args: samArgs,
                // "sam local start-api" produces "attach" messages similar to "sam local invoke".
                waitForCues: true,
                timeout: timer,
                name: config.name,
            })
            .catch(err => {
                const msg = `SAM local start-api failed${err instanceof SamCliError ? ': ' + err.message : ''}`

                throw ToolkitError.chain(err, msg)
            })
    } else {
        // 'target=code' or 'target=template'
        const localInvokeArgs: SamCliLocalInvokeInvocationArguments = {
            templateResourceName: makeResourceName(config),
            templatePath: config.templatePath,
            eventPath: config.eventPayloadFile,
            environmentVariablePath: config.envFile,
            environmentVariables: env,
            invoker: config.samLocalInvokeCommand!,
            dockerNetwork: config.sam?.dockerNetwork,
            debugPort: debugPort,
            debuggerPath: config.debuggerPath,
            debugArgs: config.debugArgs,
            containerEnvFile: config.containerEnvFile,
            extraArgs: config.sam?.localArguments,
            skipPullImage:
                config.sam?.skipNewImageCheck ?? ((await isImageLambdaConfig(config)) || config.sam?.containerBuild),
            parameterOverrides: config.parameterOverrides,
            name: config.name,
        }

        // sam local invoke ...
        const command = new SamCliLocalInvokeInvocation(localInvokeArgs)

        try {
            return await command.execute(timer)
        } catch (err) {
            const msg = `SAM local invoke failed${err instanceof SamCliError ? ': ' + err.message : ''}`
            throw ToolkitError.chain(err, msg)
        } finally {
            if (config.sam?.buildDir === undefined) {
                await remove(config.templatePath)
            }
        }
    }
}

/**
 * Prepares and invokes a lambda function via `sam local (invoke/api)`.
 *
 * @param ctx
 * @param config
 * @param onAfterBuild  Called after `SamCliBuildInvocation.execute()`
 */
export async function runLambdaFunction(
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

    const envVars = {
        ...(config.awsCredentials ? asEnvironmentVariables(config.awsCredentials) : {}),
        ...(config.aws?.region ? { AWS_DEFAULT_REGION: config.aws.region } : {}),
    }

    const settings = SamCliSettings.instance
    const timer = new Timeout(settings.getLocalInvokeTimeout())

    // TODO: refactor things to not mutate the config
    config.templatePath = await buildLambdaHandler(timer, envVars, config, settings)

    await onAfterBuild()
    timer.refresh()

    let apiRequest: Promise<void> | undefined
    if (config.invokeTarget.target === 'api') {
        const payload =
            config.eventPayloadFile === undefined
                ? undefined
                : JSON.parse(await readFile(config.eventPayloadFile, { encoding: 'utf-8' }))

        apiRequest = requestLocalApi(timer, config.api!, config.apiPort!, payload)
    }

    // SAM CLI and any API requests are executed in parallel
    // A failure from either is a failure for the whole invocation
    const [process] = await Promise.all([invokeLambdaHandler(timer, envVars, config, settings), apiRequest]).catch(
        err => {
            timer.cancel()
            throw err
        }
    )

    if (config.noDebug) {
        return config
    }

    const terminationListener = vscode.debug.onDidTerminateDebugSession(session => {
        const config = session.configuration as SamLaunchRequestArgs
        if (config.invokeTarget?.target === 'api') {
            stopApi(process, config)
        }
    })

    async function attach() {
        if (config.onWillAttachDebugger) {
            getLogger('channel').info(
                localize('AWS.output.sam.local.waiting', 'Waiting for SAM application to start...')
            )
            await config.onWillAttachDebugger(config.debugPort!, timer)
        }
        // HACK: remove non-serializable properties before attaching.
        // TODO: revisit this :)
        // eslint-disable-next-line @typescript-eslint/unbound-method
        config.onWillAttachDebugger = undefined
        config.samLocalInvokeCommand = undefined

        await attachDebugger({
            debugConfig: config,
            retryDelayMillis: attachDebuggerRetryDelayMillis,
        })

        showDebugConsole()
    }

    try {
        await attach()
    } finally {
        vscode.Disposable.from(timer, terminationListener).dispose()
    }

    return config
}

function stopApi(samStartApiProc: ChildProcess, config: vscode.DebugConfiguration) {
    if (!samStartApiProc) {
        getLogger().error('SAM: unknown debug session: %s', config.name)
        return
    }

    try {
        getLogger().verbose('SAM: sending SIGHUP to sam process: pid %d', samStartApiProc.pid())
        samStartApiProc.stop(true, 'SIGHUP')
    } catch (e) {
        getLogger().warn('SAM: failed to stop sam process: pid %d: %O', samStartApiProc.pid(), e as Error)
    }
}

/**
 * Sends an HTTP request to the local API webserver, which invokes the backing
 * Lambda, which will then enter debugging.
 */
async function requestLocalApi(
    timeout: Timeout,
    api: APIGatewayProperties,
    apiPort: number,
    payload: any
): Promise<void> {
    const retryLimit = 10 // Number of attempts before showing a 'cancel' notification
    const retryDelay = 200
    const reqMethod = api?.httpMethod || 'GET'
    const qs = (api?.querystring?.startsWith('?') ? '' : '?') + (api?.querystring ?? '')
    const uri = `http://127.0.0.1:${apiPort}${api?.path}${qs}`

    let notificationShown = false

    const reqOpts: OptionsOfTextResponseBody = {
        json: payload,
        timeout: { socket: 1000 },
        headers: api?.headers,
        method: reqMethod,
        retry: {
            // note: `calculateDelay` overrides the default function, so any functionality normally specified in the
            // retry options needs to be implemented yourself
            calculateDelay: obj => {
                if (obj.error.response !== undefined) {
                    getLogger().debug('Local API response: %s : %O', uri, obj.error.response.statusMessage)
                }
                if (obj.error.code === 'ETIMEDOUT' || obj.error.response?.statusCode === 403 || timeout.completed) {
                    return 0
                } else if (!notificationShown && obj.attemptCount >= retryLimit) {
                    notificationShown = true
                    getLogger().debug('Local API: showing cancel notification')
                    void showMessageWithCancel('Waiting for local API to start...', timeout)
                }

                getLogger().debug(`Local API: retry (${obj.attemptCount}): ${uri}: ${obj.error.message}`)
                return retryDelay
            },
        },
        // TODO: api?.stageVariables,
    }

    getLogger('channel').info(localize('AWS.sam.localApi.request', 'Sending request to local API: {0}', uri))

    await got(uri, reqOpts).catch((err: RequestError) => {
        if (err.code === 'ETIMEDOUT') {
            // HACK: request timeout (as opposed to ECONNREFUSED)
            // is a hint that debugger is attached, so we can stop requesting now.
            getLogger().info('Local API is alive: %s', uri)
            return
        }
        const msg =
            err.response?.statusCode === 403
                ? `Local API failed to respond to path: ${api?.path}`
                : `Local API failed to respond (${err.code}) at path: ${api?.path}, error: ${err.message}`

        throw ToolkitError.chain(err, msg)
    })
}

export interface AttachDebuggerContext {
    debugConfig: SamLaunchRequestArgs
    retryDelayMillis?: number
    onStartDebugging?: typeof vscode.debug.startDebugging
    onWillRetry?(): Promise<void>
}

export async function attachDebugger({
    retryDelayMillis = attachDebuggerRetryDelayMillis,
    onStartDebugging = vscode.debug.startDebugging,
    onWillRetry = async (): Promise<void> => {
        getLogger().debug('attachDebugger: retrying...')
        await sleep(retryDelayMillis)
    },
    ...params
}: AttachDebuggerContext): Promise<void> {
    getLogger().debug(
        `localLambdaRunner.attachDebugger: startDebugging with config: ${JSON.stringify(
            {
                name: params.debugConfig.name,
                invokeTarget: params.debugConfig.invokeTarget,
            },
            undefined,
            2
        )}`
    )

    getLogger('channel').info(localize('AWS.output.sam.local.attaching', 'Attaching debugger to SAM application...'))

    // The Python extension will silently fail, so it's ok for us to automatically retry
    // Users still will not be able to stop debugging without clicking stop a bunch, but
    // at least it's not modal popups.
    // TODO: figure out why the Python debug client fails to attach on the first try
    function maxRetries() {
        return params.debugConfig.runtimeFamily === RuntimeFamily.Python ? 8 : 1
    }

    let retries = 0
    while (true) {
        const isDebuggerAttached = await onStartDebugging(undefined, params.debugConfig)
        if (isDebuggerAttached) {
            break
        } else if (retries < maxRetries()) {
            if (onWillRetry) {
                await onWillRetry()
            }
            retries += 1
        } else {
            throw new ToolkitError(localize('AWS.output.sam.local.attach.failed', 'Failed to attach debugger'), {
                code: 'DebuggerRetryLimit',
            })
        }
    }

    getLogger('channel').info(localize('AWS.output.sam.local.attach.success', 'Debugger attached'))
    getLogger().verbose(
        `SAM: debug session: "${vscode.debug.activeDebugSession?.name}" / ${vscode.debug.activeDebugSession?.id}`
    )
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
        await tcpPortUsed.waitUntilUsed(port, samLocalPortCheckRetryIntervalMillis, time)
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

export function shouldAppendRelativePathToFuncHandler(runtime: string): boolean {
    // getFamily will throw an error if the runtime doesn't exist
    switch (getFamily(runtime)) {
        case RuntimeFamily.NodeJS:
        case RuntimeFamily.Python:
            return true
        case RuntimeFamily.DotNet:
            return false
        // if the runtime exists but for some reason we forgot to cover it here, throw anyway so we remember to cover it
        default:
            throw new Error('localLambdaRunner can not determine if runtime requires a relative path.')
    }
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

// TODO: rework this function. The fact that it is mutating the config file AND writing to disk is bizarre.
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
    config.eventPayloadFile = undefined
    config.envFile = undefined

    // env-vars.json (NB: effectively ignored for the `target=code` case).
    const configEnv = config.lambda?.environmentVariables ?? {}
    if (Object.keys(configEnv).length !== 0) {
        const env = JSON.stringify(getEnvironmentVariables(makeResourceName(config), configEnv))
        config.envFile = path.join(config.baseBuildDir!, 'env-vars.json')
        await writeFile(config.envFile, env)
    }

    // container-env-vars.json
    if (config.containerEnvVars) {
        config.containerEnvFile = path.join(config.baseBuildDir!, 'container-env-vars.json')
        const containerEnv = JSON.stringify(config.containerEnvVars)
        await writeFile(config.containerEnvFile, containerEnv)
    }

    // event.json
    const payloadObj = config.lambda?.payload?.json ?? config.api?.payload?.json
    const payloadPath = config.lambda?.payload?.path ?? config.api?.payload?.path

    if (Object.keys(payloadObj ?? {}).length === 0 && payloadPath === undefined) {
        return
    }

    config.eventPayloadFile = path.join(config.baseBuildDir!, 'event.json')

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
