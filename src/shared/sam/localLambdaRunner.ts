/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyFile, unlink, writeFile } from 'fs-extra'
import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import { getTemplate, getTemplateResource } from '../../lambda/local/debugConfiguration'
import { getFamily, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../extensions'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import { getLogger } from '../logger'
import { SettingsConfiguration } from '../settingsConfiguration'
import { recordLambdaInvokeLocal, Result, Runtime, recordSamAttachDebugger } from '../telemetry/telemetry'
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
import { DefaultSamCliProcessInvoker } from './cli/samCliInvoker'

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

export const makeBuildDir = async (): Promise<string> => {
    const buildDir = await makeTemporaryToolkitFolder()
    ExtensionDisposableFiles.getInstance().addFolder(buildDir)

    return pathutil.normalize(buildDir)
}

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
    if (config.invokeTarget.target === 'template') {
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
        ctx.chanLogger.info(
            'AWS.output.sam.local.startDebug',
            "Preparing to debug '{0}' locally...",
            config.handlerName
        )
    } else {
        ctx.chanLogger.info('AWS.output.sam.local.startRun', "Preparing to run '{0}' locally...", config.handlerName)
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
        parameterOverrides: config.parameterOverrides,
        skipPullImage: config.sam?.skipNewImageCheck,
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

    const localInvokeArgs: SamCliLocalInvokeInvocationArguments = {
        templateResourceName: makeResourceName(config),
        templatePath: config.templatePath,
        eventPath: config.eventPayloadFile,
        environmentVariablePath: config.envFile,
        environmentVariables: envVars,
        invoker: config.samLocalInvokeCommand!,
        dockerNetwork: config.sam?.dockerNetwork,
        debugPort: !config.noDebug ? config.debugPort?.toString() : undefined,
        debuggerPath: config.debuggerPath,
        debugArgs: config.debugArgs,
        extraArgs: config.sam?.localArguments,
        parameterOverrides: config.parameterOverrides,
        skipPullImage: config.sam?.skipNewImageCheck,
    }

    const command = new SamCliLocalInvokeInvocation(localInvokeArgs)

    const timer = createInvokeTimer(ctx.settings)

    let invokeResult: Result = 'Failed'
    try {
        await command.execute(timer)
        invokeResult = 'Succeeded'
    } catch (err) {
        ctx.chanLogger.error('AWS.error.during.sam.local', 'Failed to run SAM Application locally: {0}', err as Error)
    } finally {
        recordLambdaInvokeLocal({
            result: invokeResult,
            runtime: config.runtime as Runtime,
            debug: !config.noDebug,
        })
        if (config.outFilePath) {
            try {
                await unlink(config.outFilePath)
            } catch (err) {
                getLogger().warn(err as Error)
            }
        }
    }

    if (!config.noDebug) {
        if (config.onWillAttachDebugger) {
            messageUserWaitingToAttach(ctx.chanLogger)
            await config.onWillAttachDebugger(config.debugPort!, timer, ctx.chanLogger)
        }
    }
    // HACK: remove non-serializable properties before attaching.
    // TODO: revisit this :)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = undefined
    config.samLocalInvokeCommand = undefined

    if (!config.noDebug) {
        const attachResults = await attachDebugger({
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
        if (attachResults.success) {
            await showDebugConsole()
        }
    }

    return config
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
    config.baseBuildDir = await makeBuildDir()
    config.eventPayloadFile = path.join(config.baseBuildDir!, 'event.json')
    config.envFile = path.join(config.baseBuildDir!, 'env-vars.json')

    // env-vars.json (NB: effectively ignored for the `target=code` case).
    const env = JSON.stringify(getEnvironmentVariables(makeResourceName(config), config.lambda?.environmentVariables))
    await writeFile(config.envFile, env)

    // event.json
    if (config.lambda?.payload?.path) {
        const fullpath = tryGetAbsolutePath(config.workspaceFolder, config.lambda?.payload?.path)
        await copyFile(fullpath, config.eventPayloadFile)
    } else {
        await writeFile(config.eventPayloadFile, JSON.stringify(config.lambda?.payload?.json || {}))
    }
}
