/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import { pushIf } from '../../utilities/collectionUtils'
import * as nls from 'vscode-nls'
import { fileOrFolderExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { ChildProcess } from '../../utilities/childProcess'
import { Timeout } from '../../utilities/timeoutUtils'
import { removeAnsi } from '../../utilities/textUtilities'
import * as vscode from 'vscode'
import globals from '../../extensionGlobals'
import { SamCliSettings } from './samCliSettings'
import { addTelemetryEnvVar, collectSamErrors, SamCliError } from './samCliInvokerUtils'

const localize = nls.loadMessageBundle()

export const waitForDebuggerMessages = {
    PYTHON: 'Debugger waiting for client...',
    PYTHON_IKPDB: 'IKP3db listening on',
    NODEJS: 'Debugger listening on',
    DOTNET: 'Waiting for the debugger to attach...',
    GO_DELVE: 'launching process with args', // Comes from https://github.com/go-delve/delve/blob/f5d2e132bca763d222680815ace98601c2396517/service/debugger/debugger.go#L187
    JAVA: 'Picked up _JAVA_OPTIONS:',
}

export interface SamLocalInvokeCommandArgs {
    command: string
    args: string[]
    options?: child_process.SpawnOptions
    /** Wait until strings specified in `debuggerAttachCues` appear in the process output.  */
    waitForCues: boolean
    timeout?: Timeout
    /** Allows us to name debug sessions so we can terminate them later */
    name?: string
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
        private readonly debuggerAttachCues: string[] = [waitForDebuggerMessages.PYTHON, waitForDebuggerMessages.NODEJS]
    ) {}

    public async invoke({ options, ...params }: SamLocalInvokeCommandArgs): Promise<ChildProcess> {
        const childProcess = new ChildProcess(params.command, params.args, {
            spawnOptions: await addTelemetryEnvVar(options),
        })
        getLogger('channel').info('AWS.running.command', 'Command: {0}', `${childProcess}`)
        // "sam local invoke", "sam local start-api", etc.
        const samCommandName = `sam ${params.args[0]} ${params.args[1]}`

        const checkForCues: boolean = params.waitForCues && this.debuggerAttachCues.length !== 0
        const runDebugger = new Promise<void>(async (resolve, reject) => {
            const result = await childProcess
                .run({
                    waitForStreams: true,
                    rejectOnError: true,
                    timeout: params.timeout,
                    onStdout: (text: string): void => {
                        getLogger('debugConsole').info(text, { raw: true })
                        // If we have a timeout (as we do on debug) refresh the timeout as we receive text
                        params.timeout?.refresh()
                        this.logger.verbose('SAM: pid %d: stdout: %s', childProcess.pid(), removeAnsi(text))
                    },
                    onStderr: (text: string): void => {
                        getLogger('debugConsole').error(text, { raw: true })
                        // If we have a timeout (as we do on debug) refresh the timeout as we receive text
                        params.timeout?.refresh()
                        this.logger.verbose('SAM: pid %d: stderr: %s', childProcess.pid(), removeAnsi(text))
                        if (checkForCues) {
                            // Look for messages like "Debugger attached" before returning back to caller
                            if (this.debuggerAttachCues.some(cue => text.includes(cue))) {
                                this.logger.verbose(
                                    `SAM: pid ${childProcess.pid()}: local SAM app is ready for debugger to attach`
                                )
                                // Process will continue running, while user debugs it.
                                resolve()
                            }
                        }
                    },
                })
                .catch(error => {
                    getLogger('channel').error(
                        localize('AWS.samcli.error', 'Error running command "{0}": {1}', samCommandName, error.message)
                    )
                    reject(error)
                })

            if (result) {
                const code = result.exitCode

                this.logger.verbose(`SAM: command exited (code: ${code}): ${childProcess}`)
                // onStdout/onStderr may print partial lines. Force a newline
                // to ensure "Command stopped" appears on its own line.
                globals.outputChannel.appendLine('')
                globals.outputChannel.appendLine(
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
                    const samErrors = collectSamErrors(result.stderr)
                    if (samErrors.length > 0) {
                        const e = new SamCliError(samErrors.join('\n'))
                        reject(e)
                    } else {
                        reject(new Error(`"${samCommandName}" command stopped (error code: ${code})`))
                    }
                }

                // Forces debugger to disconnect (sometimes it fails to disconnect on its own)
                // Note that VSCode 1.42 only allows us to get the active debug session, so
                // the user will have to manually disconnect if using multiple debug sessions
                const debugSession = vscode.debug.activeDebugSession
                if (debugSession && debugSession.name === params.name) {
                    getLogger().debug('forcing disconnect of debugger session "%s"', debugSession.name)
                    debugSession.customRequest('disconnect').then(
                        () => undefined,
                        e =>
                            getLogger().warn(
                                'failed to disconnect debugger session "%s": %s',
                                debugSession.name,
                                (e as Error).message
                            )
                    )
                }
            }
        })

        await runDebugger

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
    eventPath?: string
    /**
     * Location of the file containing the environment variables to invoke the Lambda Function against.
     */
    environmentVariablePath?: string
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
     * Passed to be executed as the root process in the Lambda container
     */
    containerEnvFile?: string
    /**
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]
    /** SAM args specified by user (`sam.localArguments`). */
    extraArgs?: string[]
    /** Debug session name */
    name?: string
}

/**
 * Yet another `sam` CLI wrapper.
 */
export class SamCliLocalInvokeInvocation {
    private readonly config = SamCliSettings.instance

    public constructor(private readonly args: SamCliLocalInvokeInvocationArguments) {
        this.args.skipPullImage = !!this.args.skipPullImage
    }

    public async execute(timeout?: Timeout): Promise<ChildProcess> {
        await this.validate()

        const sam = await this.config.getOrDetectSamCli()
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
        ]

        pushIf(invokeArgs, !!this.args.eventPath, '--event', this.args.eventPath)
        pushIf(invokeArgs, !!this.args.environmentVariablePath, '--env-vars', this.args.environmentVariablePath)
        pushIf(invokeArgs, !!this.args.debugPort, '-d', this.args.debugPort!)
        pushIf(invokeArgs, !!this.args.dockerNetwork, '--docker-network', this.args.dockerNetwork!)
        pushIf(invokeArgs, !!this.args.skipPullImage, '--skip-pull-image')
        pushIf(invokeArgs, !!this.args.debuggerPath, '--debugger-path', this.args.debuggerPath!)
        pushIf(invokeArgs, !!this.args.debugArgs, '--debug-args', ...(this.args.debugArgs ?? []))
        pushIf(invokeArgs, !!this.args.containerEnvFile, '--container-env-vars', this.args.containerEnvFile)

        pushIf(
            invokeArgs,
            !!this.args.parameterOverrides && this.args.parameterOverrides.length > 0,
            '--parameter-overrides',
            ...(this.args.parameterOverrides ?? [])
        )
        invokeArgs.push(...(this.args.extraArgs ?? []))

        return await this.args.invoker.invoke({
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
            name: this.args.name,
        })
    }

    protected async validate(): Promise<void> {
        if (!this.args.templateResourceName) {
            throw new Error('template resource name is missing or empty')
        }

        if (!(await fileOrFolderExists(this.args.templatePath))) {
            throw new Error(`template path does not exist: ${this.args.templatePath}`)
        }

        if (this.args.eventPath !== undefined && !(await fileOrFolderExists(this.args.eventPath))) {
            throw new Error(`event path does not exist: ${this.args.eventPath}`)
        }
    }
}
