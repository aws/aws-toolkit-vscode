/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ChildProcess, ChildProcessResult } from '../utilities/childProcess'

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
    run(args: string[]): Promise<ChildProcessResult>
}

// TODO: Replace with a library such as https://www.npmjs.com/package/node-docker-api.
class DefaultDockerInvokeContext implements DockerInvokeContext {
    public async run(args: string[]): Promise<ChildProcessResult> {
        const process = new ChildProcess(
            'docker',
            { windowsVerbatimArguments: true },
            ...(args || [])
        )

        return await process.run()
    }
}

export class DefaultDockerClient implements DockerClient {

    public constructor(private readonly context: DockerInvokeContext = new DefaultDockerInvokeContext()) { }

    public async invoke({
        command,
        image,
        removeOnExit,
        mount,
        entryPoint
    }: DockerInvokeArguments): Promise<void> {
        const args: string[] = [ command ]

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

        const result = await this.context.run(args)
        if (result.exitCode) {
            throw new DockerError(result, args)
        }
    }
}

export class DockerError extends Error {
    public constructor(
        result: ChildProcessResult,
        args: string[]
    ) {
        super(`Could not invoke docker with arguments: [${args.join(', ')}]. ${JSON.stringify(result, undefined, 4)}`)
    }
}
