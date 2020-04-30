/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliBuildInvocationArguments {
    /**
     * The path to a folder where the built artifacts are stored.
     */
    buildDir: string
    /**
     * Resolves relative paths to the function's source code with respect to this folder.
     * If omitted, relative paths are resolved with respect to the template's location.
     */
    baseDir?: string
    /**
     * Location of the SAM Template to build
     */
    templatePath: string
    /**
     * Environment variables to set on the child process.
     */
    environmentVariables?: NodeJS.ProcessEnv
    /**
     * Manages the sam cli execution.
     */
    invoker: SamCliProcessInvoker
    /**
     * If your functions depend on packages that have natively compiled dependencies,
     * use this flag to build your function inside an AWS Lambda-like Docker container.
     */
    useContainer?: boolean
    /**
     * Specifies the name or id of an existing Docker network to Lambda Docker containers should connect to,
     * along with the default bridge network.
     * If not specified, the Lambda containers will only connect to the default bridge Docker network.
     */
    dockerNetwork?: string
    /**
     * Specifies whether the command should skip pulling down the latest Docker image for Lambda runtime.
     */
    skipPullImage?: boolean
    /**
     * The path to a custom dependency manifest (ex: package.json) to use instead of the default one.
     */
    manifestPath?: string
}

export interface FileFunctions {
    fileExists: typeof fileExists
}

/**
 * An elaborate way to run `sam build`.
 */
export class SamCliBuildInvocation {
    private readonly buildDir: string
    private readonly baseDir?: string
    private readonly environmentVariables?: NodeJS.ProcessEnv
    private readonly templatePath: string
    private readonly invoker: SamCliProcessInvoker
    private readonly useContainer: boolean
    private readonly dockerNetwork?: string
    private readonly skipPullImage: boolean
    private readonly manifestPath?: string

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
        private readonly context: { file: FileFunctions } = { file: getDefaultFileFunctions() }
    ) {
        this.buildDir = params.buildDir
        this.baseDir = params.baseDir
        this.templatePath = params.templatePath
        this.environmentVariables = params.environmentVariables
        this.invoker = invoker
        this.useContainer = useContainer
        this.dockerNetwork = params.dockerNetwork
        this.skipPullImage = skipPullImage
        this.manifestPath = params.manifestPath
    }

    public async execute(): Promise<void> {
        await this.validate()

        const invokeArgs: string[] = ['build', '--build-dir', this.buildDir, '--template', this.templatePath]

        this.addArgumentIf(invokeArgs, !!this.baseDir, '--base-dir', this.baseDir!)
        this.addArgumentIf(invokeArgs, !!this.dockerNetwork, '--docker-network', this.dockerNetwork!)
        this.addArgumentIf(invokeArgs, !!this.useContainer, '--use-container')
        this.addArgumentIf(invokeArgs, !!this.skipPullImage, '--skip-pull-image')
        this.addArgumentIf(invokeArgs, !!this.manifestPath, '--manifest', this.manifestPath!)

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            ...this.environmentVariables,
        }

        const childProcessResult = await this.invoker.invoke({
            spawnOptions: { env },
            arguments: invokeArgs,
        })

        logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
    }

    private addArgumentIf(args: string[], addIfConditional: boolean, ...argsToAdd: string[]) {
        if (addIfConditional) {
            args.push(...argsToAdd)
        }
    }

    private async validate(): Promise<void> {
        if (!(await this.context.file.fileExists(this.templatePath))) {
            const logger: Logger = getLogger()

            const err = new Error(`template path does not exist: ${this.templatePath}`)
            logger.error(err)
            throw err
        }
    }
}

function getDefaultFileFunctions(): FileFunctions {
    return {
        fileExists,
    }
}
