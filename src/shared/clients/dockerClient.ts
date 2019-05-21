/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as child_process from 'child_process'
import * as crossSpawn from 'cross-spawn'

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

export interface Closeable {
    onClose(callback: (code: number, signal: string, args?: string[]) => void): void
}

export interface DockerInvokeContext {
    spawn(
        command: string,
        args?: string[],
        options?: child_process.SpawnOptions
    ): Closeable
}

// TODO: Replace with a library such as https://www.npmjs.com/package/node-docker-api.
export class DefaultDockerClient implements DockerClient {

    public constructor(private readonly context: DockerInvokeContext = {
        spawn(command, args, options): Closeable {
            const process = crossSpawn('docker', args, { windowsVerbatimArguments: true })

            return {
                onClose(callback: (code: number, signal: string, args?: string[]) => void): void {
                    process.once('close', (_code, _signal) => callback(_code, _signal, args))
                }
            }
        }
    }) { }

    public async invoke({
        command,
        image,
        removeOnExit,
        mount,
        entryPoint
    }: DockerInvokeArguments): Promise<void> {
        const args: string[] = [ command, image ]

        if (removeOnExit) {
            args.push('--rm')
        }

        if (mount) {
            args.push(
                '--mount',
                `type=${mount.type},src=${mount.source},dst=${mount.destination}`
            )
        }

        if (entryPoint) {
            args.push(
                '--entrypoint',
                entryPoint.command,
                ...entryPoint.args
            )
        }

        const process = this.context.spawn(
            'docker',
            args,
            { windowsVerbatimArguments: true }
        )

        await new Promise<void>((resolve, reject) => {
            process.onClose((code, signal) => {
                if (code === 0) {
                    resolve()
                } else {
                    reject(new DockerError(code, signal, args))
                }
            })
        })
    }
}

export class DockerError extends Error {
    public constructor(
        public readonly code: number,
        public readonly signal: string,
        args: string[]
    ) {
        super(`Could not invoke docker. Code: ${code}, Signal: ${signal}, Arguments: [${args.join(', ')}]`)
    }
}
