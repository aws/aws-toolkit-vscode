/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

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
    /**
     * Specifies whether the command should skip pulling down the latest Docker image for Lambda runtime.
     */
    skipPullImage?: boolean,
}

export class SamCliBuildInvocation {
    private readonly buildDir: string
    private readonly baseDir?: string
    private readonly templatePath: string
    private readonly invoker: SamCliProcessInvoker
    private readonly useContainer: boolean
    private readonly dockerNetwork?: string
    private readonly skipPullImage: boolean

    /**
     * @see SamCliBuildInvocationArguments for parameter info
     * invoker - Defaults to DefaultSamCliProcessInvoker
     * useContainer - Defaults to false (function will be built on local machine instead of in a docker image)
     * skipPullImage - Defaults to false (the latest Docker image will be pulled down if necessary)
     */
    public constructor(
        {
            invoker = new DefaultSamCliProcessInvoker(),
            useContainer = false,
            skipPullImage = false,
            ...params
        }: SamCliBuildInvocationArguments,
    ) {
        this.buildDir = params.buildDir
        this.baseDir = params.baseDir
        this.templatePath = params.templatePath
        this.invoker = invoker
        this.useContainer = useContainer
        this.dockerNetwork = params.dockerNetwork
        this.skipPullImage = skipPullImage
    }

    public async execute(): Promise<void> {
        const logger: Logger = getLogger()
        await this.validate()

        const invokeArgs: string[] = [
            'build',
            '--build-dir', this.buildDir,
            '--template', this.templatePath,
        ]

        this.addArgumentIf(invokeArgs, !!this.baseDir, '--base-dir', this.baseDir!)
        this.addArgumentIf(invokeArgs, !!this.dockerNetwork, '--docker-network', this.dockerNetwork!)
        this.addArgumentIf(invokeArgs, !!this.useContainer, '--use-container')
        this.addArgumentIf(invokeArgs, !!this.skipPullImage, '--skip-pull-image')

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

    private addArgumentIf(args: string[], addIfConditional: boolean, ...argsToAdd: string[]) {
        if (addIfConditional) {
            args.push(...argsToAdd)
        }
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
