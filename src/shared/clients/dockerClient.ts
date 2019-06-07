/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { ChildProcess } from '../utilities/childProcess'
import { ChannelLogger, getChannelLogger } from '../utilities/vsCodeUtils'

export interface DockerClient {
    invoke(args: DockerInvokeArguments): Promise<void>
}

export interface DockerInvokeArguments {
    command: 'run'
    image: string
    removeOnExit?: boolean
    mount?: {
        type: 'bind',
        source: string,
        destination: string
    }
    entryPoint?: {
        command: string
        args: string[]
    }
}

export interface DockerInvokeContext {
    run(args: string[]): Promise<void>
}

// TODO: Replace with a library such as https://www.npmjs.com/package/node-docker-api.
class DefaultDockerInvokeContext implements DockerInvokeContext {
    private readonly channelLogger: ChannelLogger

    public constructor(
        outputChannel: vscode.OutputChannel,
    ) {
        this.channelLogger = getChannelLogger(outputChannel)
    }

    public async run(args: string[]): Promise<void> {
        const process = new ChildProcess(
            'docker',
            {},
            ...(args || [])
        )

        return new Promise<void>(async (resolve, reject) => {
            let stderr: string

            await process.start({
                onStdout: (text: string) => {
                    this.channelLogger.channel.append(text)
                },
                onStderr: (text: string) => {
                    stderr += text
                },
                onError: (error: Error) => {
                    reject(error)
                },
                onClose: (code, signal) => {
                    if (code) {
                        const errorMessage: string = `Could not invoke docker with arguments: [${args.join(', ')}].`
                            + `${JSON.stringify(
                                {
                                    exitCode: code,
                                    stdErr: stderr,
                                },
                                undefined,
                                4)}`

                        reject(new Error(errorMessage))
                    }

                    resolve()
                }
            })
        })
    }
}

export class DefaultDockerClient implements DockerClient {

    public constructor(
        outputChannel: vscode.OutputChannel,
        private readonly context: DockerInvokeContext = new DefaultDockerInvokeContext(outputChannel)
    ) { }

    public async invoke({
        command,
        image,
        removeOnExit,
        mount,
        entryPoint
    }: DockerInvokeArguments): Promise<void> {
        const args: string[] = [command]

        if (removeOnExit) {
            args.push('--rm')
        }

        if (mount) {
            args.push('--mount', `type=${mount.type},src=${mount.source},dst=${mount.destination}`)
        }

        if (entryPoint) {
            args.push('--entrypoint', entryPoint.command)
        }

        args.push(image)

        if (entryPoint) {
            args.push(...entryPoint.args)
        }

        await this.context.run(args)
    }
}
