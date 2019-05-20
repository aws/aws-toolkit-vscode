/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as crossSpawn from 'cross-spawn'

export interface DockerClient {
    invoke(args: DockerInvokeArgs): Promise<void>
}

export interface DockerInvokeArgs {
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

// TODO: Replace with a library such as https://www.npmjs.com/package/node-docker-api.
export class DefaultDockerClient implements DockerClient {
    public async invoke({
        command,
        image,
        removeOnExit,
        mount,
        entryPoint
    }: DockerInvokeArgs): Promise<void> {
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
                entryPoint.command,
                ...entryPoint.args
            )
        }

        const process = crossSpawn(
            'docker',
            args,
            { windowsVerbatimArguments: true }
        )

        await new Promise<void>((resolve, reject) => {
            process.once('close', (code, signal) => {
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
