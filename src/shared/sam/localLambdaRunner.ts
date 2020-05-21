/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { unlink, writeFile } from 'fs-extra'
import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'
import { getTemplate } from '../../lambda/local/debugConfiguration'
import { getFamily, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../extensions'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import { getLogger } from '../logger'
import { SettingsConfiguration } from '../settingsConfiguration'
import { recordLambdaInvokeLocal, recordSamAttachDebugger, Result, Runtime } from '../telemetry/telemetry'
import { TelemetryService } from '../telemetry/telemetryService'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { ExtensionDisposableFiles } from '../utilities/disposableFiles'
import * as pathutil from '../utilities/pathUtils'
import { normalizeSeparator } from '../utilities/pathUtils'
import { Timeout } from '../utilities/timeoutUtils'
import { ChannelLogger } from '../utilities/vsCodeUtils'
import { DefaultValidatingSamCliProcessInvoker } from './cli/defaultValidatingSamCliProcessInvoker'
import { SamCliBuildInvocation, SamCliBuildInvocationArguments } from './cli/samCliBuild'
import { SamCliProcessInvoker } from './cli/samCliInvokerUtils'
import { SamCliLocalInvokeInvocation, SamCliLocalInvokeInvocationArguments } from './cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from './debugger/samDebugSession'

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

function getEnvironmentVariables(env: { [k: string]: string | number | boolean }): SAMTemplateEnvironmentVariables {
    return env ? { [TEMPLATE_RESOURCE_NAME]: env } : {}
}

const TEMPLATE_RESOURCE_NAME = 'awsToolkitSamLocalResource'
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
    let newTemplate = new SamTemplateGenerator()
        .withFunctionHandler(config.handlerName)
        .withResourceName(TEMPLATE_RESOURCE_NAME)
        .withRuntime(config.runtime)
        .withCodeUri(config.codeRoot)

    if (config.invokeTarget.target === 'template') {
        const template = getTemplate(config.workspaceFolder, config)
        // TODO: does target=code have an analog to this?
        if (template?.Globals) {
            newTemplate = newTemplate.withGlobals(template?.Globals)
        }
    }
    if (config.lambda?.memoryMb) {
        newTemplate = newTemplate.withMemorySize(config.lambda?.memoryMb)
    }
    if (config.lambda?.timeoutSec) {
        newTemplate = newTemplate.withTimeout(config.lambda?.timeoutSec)
    }
    if (config.lambda?.environmentVariables) {
        newTemplate = newTemplate.withEnvironment({
            Variables: config.lambda?.environmentVariables,
        })
    }

    const inputTemplatePath: string = path.join(config.baseBuildDir!, 'input', 'input-template.yaml')
    ExtensionDisposableFiles.getInstance().addFolder(inputTemplatePath)
    await newTemplate.generate(inputTemplatePath)

    return pathutil.normalize(inputTemplatePath)
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

/**
 * Prepares and invokes a lambda function via `sam local invoke`.
 *
 * @param ctx
 * @param config
 * @param onAfterBuild  Called after `executeSamBuild()`
 */
export async function invokeLambdaFunction(
    ctx: ExtContext,
    config: SamLaunchRequestArgs,
    onAfterBuild: () => Promise<void>
): Promise<void> {
    // Switch over to the output channel so the user has feedback that we're getting things ready
    ctx.chanLogger.channel.show(true)
    ctx.chanLogger.info('AWS.output.sam.local.start', 'Preparing to run {0} locally...', config.handlerName)

    const processInvoker = new DefaultValidatingSamCliProcessInvoker({})
    const buildArgs: ExecuteSamBuildArguments = {
        baseBuildDir: config.baseBuildDir!,
        channelLogger: ctx.chanLogger,
        codeDir: config.codeRoot,
        inputTemplatePath: config.samTemplatePath!,
        manifestPath: config.manifestPath,
        samProcessInvoker: processInvoker,
        useContainer: config.sam?.containerBuild || false,
        environmentVariables: config.lambda?.environmentVariables,
    }

    if (!config.noDebug) {
        buildArgs.environmentVariables = {
            SAM_BUILD_MODE: 'debug',
        }
    }

    // XXX: reassignment
    config.samTemplatePath = await executeSamBuild(buildArgs)
    delete config.invokeTarget // Must not be used beyond this point.

    await onAfterBuild()

    ctx.chanLogger.info(
        'AWS.output.starting.sam.app.locally',
        'Starting the SAM Application locally (see Terminal for output)'
    )
    getLogger().debug(`localLambdaRunner.invokeLambdaFunction: ${config.name}`)

    const eventPath: string = path.join(config.baseBuildDir!!, 'event.json')
    const environmentVariablePath = path.join(config.baseBuildDir!!, 'env-vars.json')
    const env = JSON.stringify(getEnvironmentVariables(config.lambda?.environmentVariables ?? {}))
    const maxRetries: number = getAttachDebuggerMaxRetryLimit(ctx.settings, MAX_DEBUGGER_RETRIES_DEFAULT)

    await writeFile(eventPath, JSON.stringify(config.lambda?.event || {}))
    await writeFile(environmentVariablePath, env)

    const localInvokeArgs: SamCliLocalInvokeInvocationArguments = {
        templateResourceName: TEMPLATE_RESOURCE_NAME,
        templatePath: config.samTemplatePath,
        eventPath,
        environmentVariablePath,
        invoker: config.samLocalInvokeCommand!,
        dockerNetwork: config.sam?.dockerNetwork,
        debugPort: !config.noDebug ? config.debugPort?.toString() : undefined,
        debuggerPath: config.debuggerPath,
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

        // HACK: remove non-serializable properties before attaching.
        // TODO: revisit this :)
        config.onWillAttachDebugger = undefined
        config.samLocalInvokeCommand = undefined
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
        getLogger().warn(`Timed out after ${remainingTime} ms waiting for port ${debugPort} to open`, err as Error)

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
        getLogger().verbose('Unable to switch to the Debug Console', err as Error)
    }
}

function messageUserWaitingToAttach(channelLogger: ChannelLogger) {
    channelLogger.info(
        'AWS.output.sam.local.waiting',
        'Waiting for SAM Application to start before attaching debugger...'
    )
}
