/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import { pushIf } from '../../utilities/collectionUtils'
import * as nls from 'vscode-nls'
import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { ChildProcess } from '../../utilities/childProcess'
import { Timeout } from '../../utilities/timeoutUtils'
import { ChannelLogger } from '../../utilities/vsCodeUtils'
import { DefaultSamCliProcessInvokerContext, SamCliProcessInvokerContext } from './samCliInvoker'
import { removeAnsi } from '../../utilities/textUtilities'

const localize = nls.loadMessageBundle()

export const WAIT_FOR_DEBUGGER_MESSAGES = {
    PYTHON: 'Starting debugger',
    PYTHON_IKPDB: 'IKP3db listening on',
    NODEJS: 'Debugger listening on',
    DOTNET: 'Waiting for the debugger to attach...',
}

export interface SamLocalInvokeCommandArgs {
    command: string
    args: string[]
    options?: child_process.SpawnOptions
    /** Wait until strings specified in `debuggerAttachCues` appear in the process output.  */
    waitForCues: boolean
    timeout?: Timeout
}

/**
 * Yet another `sam` CLI wrapper.
 */
export interface SamLocalInvokeCommand {
    /** @returns `sam` process (may be running or stopped) */
    invoke(items: SamLocalInvokeCommandArgs): Promise<ChildProcess>
}

/**
 * Yet another `sam` CLI wrapper.
 *
 * TODO: Merge this with `DefaultSamCliProcessInvoker`.
 */
export class DefaultSamLocalInvokeCommand implements SamLocalInvokeCommand {
    private readonly logger: Logger = getLogger()

    public constructor(
        private readonly channelLogger: ChannelLogger,
        private readonly debuggerAttachCues: string[] = [
            WAIT_FOR_DEBUGGER_MESSAGES.PYTHON,
            WAIT_FOR_DEBUGGER_MESSAGES.NODEJS,
        ]
    ) {}

    public async invoke({ options, ...params }: SamLocalInvokeCommandArgs): Promise<ChildProcess> {
        const childProcess = new ChildProcess(params.command, options, ...params.args)
        this.channelLogger.info('AWS.running.command', 'Running: {0}', `${childProcess}`)
        // "sam local invoke", "sam local start-api", etc.
        const samCommandName = `sam ${params.args[0]} ${params.args[1]}`

        let timeExpired: boolean = true
        const checkForCues: boolean = params.waitForCues && this.debuggerAttachCues.length !== 0
        const runDebugger = new Promise<void>((resolve, reject) => {
            return childProcess.start({
                onStdout: (text: string): void => {
                    this.channelLogger.emitMessage(text)
                    // If we have a timeout (as we do on debug) refresh the timeout as we receive text
                    params.timeout?.refresh()
                    this.logger.verbose('SAM: pid %d: stdout: %s', childProcess.pid(), removeAnsi(text))
                },
                onStderr: (text: string): void => {
                    this.channelLogger.emitMessage(text)
                    // If we have a timeout (as we do on debug) refresh the timeout as we receive text
                    params.timeout?.refresh()
                    this.logger.verbose('SAM: pid %d: stderr: %s', childProcess.pid(), removeAnsi(text))
                    if (checkForCues) {
                        // Look for messages like "Waiting for debugger to attach" before returning back to caller
                        if (this.debuggerAttachCues.some(cue => text.includes(cue))) {
                            this.logger.verbose(
                                `SAM: pid ${childProcess.pid()}: local SAM app is ready for debugger to attach`
                            )
                            // Process will continue running, while user debugs it.
                            resolve()
                        }
                    }
                },
                onClose: (code: number, _: string): void => {
                    this.logger.verbose(`SAM: command exited (code: ${code}): ${childProcess}`)
                    // onStdout/onStderr may print partial lines. Force a newline
                    // to ensure "Command stopped" appears on its own line.
                    this.channelLogger.emitMessage('\n')
                    this.channelLogger.channel.appendLine(
                        localize('AWS.samcli.stopped', 'Command stopped: "{0}"', samCommandName)
                    )

                    // Process ended without emitting a known "cue" message.
                    // Possible causes:
                    // - User killed Docker or the process directly.
                    // - User manually attached before we found a "cue" message.
                    // - We need to update the list of "cue" messages.
                    if (code === 0) {
                        resolve()
                    } else if (code !== 0) {
                        reject(new Error(`"${samCommandName}" command stopped (error code: ${code})`))
                    }
                },
                onError: (error: Error): void => {
                    this.channelLogger.error(
                        'AWS.samcli.error',
                        'Error running command "{0}": {1}',
                        samCommandName,
                        error
                    )
                    reject(error)
                },
            })
        }).then(() => {
            timeExpired = false
        })

        const awaitedPromises = params.timeout ? [runDebugger, params.timeout.timer] : [runDebugger]

        await Promise.race(awaitedPromises).catch(async () => {
            if (timeExpired) {
                this.channelLogger.error(
                    'AWS.samcli.timeout',
                    'Timeout while waiting for command: "{0}"',
                    samCommandName
                )
                if (!childProcess.stopped) {
                    childProcess.stop()
                }
                throw new Error(`Timeout while waiting for command: "${samCommandName}"`)
            }
        })

        return childProcess
    }
}

export interface SamCliLocalInvokeInvocationArguments {
    /**
     * The name of the resource in the SAM Template to be invoked.
     */
    templateResourceName: string
    /**
     * Location of the SAM Template to invoke locally against.
     */
    templatePath: string
    /**
     * Location of the file containing the Lambda Function event payload.
     */
    eventPath: string
    /**
     * Location of the file containing the environment variables to invoke the Lambda Function against.
     */
    environmentVariablePath: string
    /**
     * Environment variables set when invoking the SAM process (NOT passed to the Lambda).
     */
    environmentVariables?: NodeJS.ProcessEnv
    /**
     * When specified, starts the Lambda function container in debug mode and exposes this port on the local host.
     */
    debugPort?: string
    /**
     * Manages the sam cli execution.
     */
    invoker: SamLocalInvokeCommand
    /**
     * Specifies the name or id of an existing Docker network to Lambda Docker containers should connect to,
     * along with the default bridge network.
     * If not specified, the Lambda containers will only connect to the default bridge Docker network.
     */
    dockerNetwork?: string
    /**
     * - true: Do not pull the latest Docker image for Lambda runtime.
     * - false: Pull the latest Docker image if necessary
     */
    skipPullImage?: boolean
    /**
     * Host path to a debugger that will be mounted into the Lambda container.
     */
    debuggerPath?: string
    /**
     * Passed to be executed as the root process in the Lambda container
     */
    debugArgs?: string[]
    /**
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]
    /** SAM args specified by user (`sam.localArguments`). */
    extraArgs?: string[]
}

/**
 * Yet another `sam` CLI wrapper.
 */
export class SamCliLocalInvokeInvocation {
    private readonly invokerContext: SamCliProcessInvokerContext

    public constructor(private readonly args: SamCliLocalInvokeInvocationArguments) {
        this.args.skipPullImage = !!this.args.skipPullImage

        // Enterprise!
        this.invokerContext = new DefaultSamCliProcessInvokerContext()
    }

    public async execute(timeout?: Timeout): Promise<void> {
        await this.validate()

        const sam = await this.invokerContext.cliConfig.getOrDetectSamCli()
        if (!sam.path) {
            getLogger().warn('SAM CLI not found and not configured')
        } else if (sam.autoDetected) {
            getLogger().info('SAM CLI not configured, using SAM found at: %O', sam.path)
        }

        const samCommand = sam.path ? sam.path : 'sam'
        const invokeArgs = [
            'local',
            'invoke',
            ...(getLogger().logLevelEnabled('debug') ? ['--debug'] : []),
            this.args.templateResourceName,
            '--template',
            this.args.templatePath,
            '--event',
            this.args.eventPath,
            '--env-vars',
            this.args.environmentVariablePath,
        ]

        pushIf(invokeArgs, !!this.args.debugPort, '-d', this.args.debugPort!)
        pushIf(invokeArgs, !!this.args.dockerNetwork, '--docker-network', this.args.dockerNetwork!)
        pushIf(invokeArgs, !!this.args.skipPullImage, '--skip-pull-image')
        pushIf(invokeArgs, !!this.args.debuggerPath, '--debugger-path', this.args.debuggerPath!)
        pushIf(invokeArgs, !!this.args.debugArgs, '--debug-args', ...(this.args.debugArgs ?? []))
        pushIf(
            invokeArgs,
            !!this.args.parameterOverrides && this.args.parameterOverrides.length > 0,
            '--parameter-overrides',
            ...(this.args.parameterOverrides ?? [])
        )
        invokeArgs.push(...(this.args.extraArgs ?? []))

        await this.args.invoker.invoke({
            options: {
                env: {
                    ...process.env,
                    ...this.args.environmentVariables,
                },
            },
            command: samCommand,
            args: invokeArgs,
            waitForCues: !!this.args.debugPort,
            timeout,
        })
    }

    protected async validate(): Promise<void> {
        if (!this.args.templateResourceName) {
            throw new Error('template resource name is missing or empty')
        }

        if (!(await fileExists(this.args.templatePath))) {
            throw new Error(`template path does not exist: ${this.args.templatePath}`)
        }

        if (!(await fileExists(this.args.eventPath))) {
            throw new Error(`event path does not exist: ${this.args.eventPath}`)
        }
    }
}
