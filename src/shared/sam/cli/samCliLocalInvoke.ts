/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as child_process from 'child_process'
import * as vscode from 'vscode'
import { fileExists } from '../../filesystemUtilities'
import { ChildProcess } from '../../utilities/childProcess'
import { ChannelLogger } from '../../utilities/vsCodeUtils'

export const WAIT_FOR_DEBUGGER_MESSAGES = {
    PYTHON: 'Waiting for debugger to attach...',
    NODEJS810: 'Debugger listening on',
}

export interface SamLocalInvokeCommandArgs {
    command: string,
    args: string[],
    options?: child_process.SpawnOptions,
    waitForDebuggerAttachMessage: boolean,
}

/**
 * Represents and manages the SAM CLI command that is run to locally invoke SAM Applications.
 */
export interface SamLocalInvokeCommand {
    invoke({ }: SamLocalInvokeCommandArgs): Promise<void>
}

export class DefaultSamLocalInvokeCommand implements SamLocalInvokeCommand {
    public constructor(private readonly channelLogger: ChannelLogger) {
    }

    public async invoke({
        options = {},
        ...params
    }: SamLocalInvokeCommandArgs): Promise<void> {
        this.channelLogger.info(
            'AWS.running.command',
            'Running command: {0}',
            `${params.command} ${params.args.join(' ')}`
        )

        const childProcess = new ChildProcess(params.command, options, ...params.args)

        await new Promise<void>(async (resolve, reject) => {
            let checkForDebuggerAttachCue: boolean = params.waitForDebuggerAttachMessage

            // todo : identify the debugger messages to listen for in each runtime
            const debuggerAttachCues: string[] = [
                WAIT_FOR_DEBUGGER_MESSAGES.PYTHON,
                WAIT_FOR_DEBUGGER_MESSAGES.NODEJS810,
            ]

            await childProcess.start(
                {
                    onStdout: (text: string): void => {
                        this.emitMessage(text)
                    },
                    onStderr: (text: string): void => {
                        this.emitMessage(text)
                        if (checkForDebuggerAttachCue) {
                            // eg: waiting for debugger to attach
                            if (debuggerAttachCues.some(cue => text.includes(cue))) {
                                this.channelLogger.logger.debug(
                                    'Local SAM App should be ready for a debugger to attach now.'
                                )
                                resolve()
                                checkForDebuggerAttachCue = false
                            }
                        }
                    },
                    onClose: (code: number, signal: string): void => {
                        this.channelLogger.logger.debug(`SAM CLI closed local SAM Application with code ${code}`)
                    },
                    onError: (error: Error): void => {
                        this.channelLogger.error(
                            'AWS.samcli.local.invoke.error',
                            'Error encountered running local SAM Application',
                            error
                        )
                    },
                }
            )

            if (!checkForDebuggerAttachCue) {
                this.channelLogger.logger.debug('Local SAM App should not expect a debugger to attach.')
                resolve()
            }
        })

    }

    private emitMessage(text: string): void {
        this.channelLogger.channel.append(text)
        vscode.debug.activeDebugConsole.append(text)
    }
}

export interface SamCliLocalInvokeInvocationArguments {
    /**
     * The name of the resource in the SAM Template to be invoked.
     */
    templateResourceName: string,
    /**
     * Location of the SAM Template to invoke locally against.
     */
    templatePath: string,
    /**
     * Location of the file containing the Lambda Function event payload.
     */
    eventPath: string,
    /**
     * Location of the file containing the environment variables to invoke the Lambda Function against.
     */
    environmentVariablePath: string,
    /**
     * When specified, starts the Lambda function container in debug mode and exposes this port on the local host.
     */
    debugPort?: string,
    /**
     * Manages the sam cli execution.
     */
    invoker: SamLocalInvokeCommand,
    /**
     * Specifies the name or id of an existing Docker network to Lambda Docker containers should connect to,
     * along with the default bridge network.
     * If not specified, the Lambda containers will only connect to the default bridge Docker network.
     */
    dockerNetwork?: string,
    /**
     * Specifies whether the command should skip pulling down the latest Docker image for Lambda runtime.
     */
    skipPullImage?: boolean,
}

export class SamCliLocalInvokeInvocation {
    private readonly templateResourceName: string
    private readonly templatePath: string
    private readonly eventPath: string
    private readonly environmentVariablePath: string
    private readonly debugPort?: string
    private readonly invoker: SamLocalInvokeCommand
    private readonly dockerNetwork?: string
    private readonly skipPullImage: boolean

    /**
     * @see SamCliLocalInvokeInvocationArguments for parameter info
     * skipPullImage - Defaults to false (the latest Docker image will be pulled down if necessary)
     */
    public constructor({
        skipPullImage = false,
        ...params
    }: SamCliLocalInvokeInvocationArguments
    ) {
        this.templateResourceName = params.templateResourceName
        this.templatePath = params.templatePath
        this.eventPath = params.eventPath
        this.environmentVariablePath = params.environmentVariablePath
        this.debugPort = params.debugPort
        this.invoker = params.invoker
        this.dockerNetwork = params.dockerNetwork
        this.skipPullImage = skipPullImage
    }

    public async execute(): Promise<void> {
        await this.validate()

        const args = [
            'local',
            'invoke',
            this.templateResourceName,
            '--template',
            this.templatePath,
            '--event',
            this.eventPath,
            '--env-vars',
            this.environmentVariablePath
        ]

        this.addArgumentIf(args, !!this.debugPort, '-d', this.debugPort!)
        this.addArgumentIf(args, !!this.dockerNetwork, '--docker-network', this.dockerNetwork!)
        this.addArgumentIf(args, !!this.skipPullImage, '--skip-pull-image')

        await this.invoker.invoke({
            command: 'sam',
            args,
            waitForDebuggerAttachMessage: !!this.debugPort,
        })
    }

    protected async validate(): Promise<void> {
        if (!this.templateResourceName) {
            throw new Error('template resource name is missing or empty')
        }

        if (!await fileExists(this.templatePath)) {
            throw new Error(`template path does not exist: ${this.templatePath}`)
        }

        if (!await fileExists(this.eventPath)) {
            throw new Error(`event path does not exist: ${this.eventPath}`)
        }
    }

    private addArgumentIf(args: string[], addIfConditional: boolean, ...argsToAdd: string[]) {
        if (addIfConditional) {
            args.push(...argsToAdd)
        }
    }
}
