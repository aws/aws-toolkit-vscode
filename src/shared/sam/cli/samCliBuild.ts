/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from './samCliInvoker'

export interface SamCliBuildInvocationArguments {
    /**
     * The path to a folder where the built artifacts are stored.
     */
    buildDir: string,
    /**
     * Resolves relative paths to the function's source code with respect to this folder.
     * If omitted, relative paths are resolved with respect to the template's location.
     */
    baseDir?: string,
    /**
     * Location of the SAM Template to build
     */
    templatePath: string,
    /**
     * Manages the sam cli execution.
     */
    invoker: SamCliProcessInvoker,
    /**
     * If your functions depend on packages that have natively compiled dependencies,
     * use this flag to build your function inside an AWS Lambda-like Docker container.
     */
    useContainer?: boolean,
    /**
     * Specifies the name or id of an existing Docker network to Lambda Docker containers should connect to,
     * along with the default bridge network.
     * If not specified, the Lambda containers will only connect to the default bridge Docker network.
     */
    dockerNetwork?: string,
}

export class SamCliBuildInvocation {
    private readonly buildDir: string
    private readonly baseDir?: string
    private readonly templatePath: string
    private readonly invoker: SamCliProcessInvoker
    private readonly useContainer: boolean
    private readonly dockerNetwork?: string

    /**
     * @see SamCliBuildInvocationArguments for parameter info
     * invoker - Defaults to DefaultSamCliProcessInvoker
     * useContainer - Defaults to false
     */
    public constructor(
        {
            invoker = new DefaultSamCliProcessInvoker(),
            useContainer = false,
            ...params
        }: SamCliBuildInvocationArguments,
    ) {
        this.buildDir = params.buildDir
        this.baseDir = params.baseDir
        this.templatePath = params.templatePath
        this.invoker = invoker
        this.useContainer = useContainer
        this.dockerNetwork = params.dockerNetwork
    }

    public async execute(): Promise<void> {
        const logger: Logger = getLogger()
        await this.validate()

        const invokeArgs: string[] = [
            'build',
            '--build-dir', this.buildDir,
            '--template', this.templatePath,
        ]

        if (this.baseDir) {
            invokeArgs.push(
                '--base-dir', this.baseDir,
            )
        }

        if (this.useContainer) {
            invokeArgs.push(
                '--use-container',
            )
        }

        if (this.dockerNetwork) {
            invokeArgs.push(
                '--docker-network', this.dockerNetwork
            )
        }

        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            ...invokeArgs
        )

        if (exitCode === 0) {
            return
        }

        console.error('SAM CLI error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const err =
            new Error(`sam build encountered an error: ${error && error.message ? error.message : stderr || stdout}`)
        logger.error(err)
        throw err
    }

    private async validate(): Promise<void> {
        const logger: Logger = getLogger()
        if (!await fileExists(this.templatePath)) {
            const err = new Error(`template path does not exist: ${this.templatePath}`)
            logger.error(err)
            throw err
        }
    }
}
