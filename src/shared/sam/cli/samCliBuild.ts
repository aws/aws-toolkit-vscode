/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { pushIf } from '../../utilities/collectionUtils'
import { localize } from '../../utilities/vsCodeUtils'

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
     * Environment variables set when invoking the SAM process (NOT passed to the Lambda).
     */
    environmentVariables?: NodeJS.ProcessEnv
    /**
     * Manages the sam cli execution.
     */
    invoker: SamCliProcessInvoker
    /**
     * - true: If your Lambda depends on packages that need to be compiled natively,
     *   use this flag to build your function inside an AWS Lambda-like Docker container.
     * - false: Lambda will be built on local machine instead of in a Docker image.
     */
    useContainer?: boolean
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
     * The path to a custom dependency manifest (ex: package.json) to use instead of the default one.
     */
    manifestPath?: string
    /**
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]
    /** SAM args specified by user (`sam.buildArguments`). */
    extraArgs?: string[]
}

export interface FileFunctions {
    fileExists: typeof fileExists
}

/**
 * An elaborate way to run `sam build`.
 */
export class SamCliBuildInvocation {
    private _failure: string | undefined

    public constructor(
        private readonly args: SamCliBuildInvocationArguments,
        private readonly context: { file: FileFunctions } = { file: getDefaultFileFunctions() }
    ) {
        this.args.invoker = this.args.invoker ?? new DefaultSamCliProcessInvoker()
        this.args.useContainer = !!this.args.useContainer
        this.args.skipPullImage = !!this.args.skipPullImage
    }

    /** Gets the failure message, or undefined if no failure was detected.  */
    public failure(): string | undefined {
        return this._failure
    }

    /**
     * Invokes "sam build".
     *
     * @returns Process exit code, or -1 if `SamCliBuildInvocation` stopped the process and stored a failure message in `SamCliBuildInvocation.failure()`.
     */
    public async execute(): Promise<number> {
        await this.validate()

        const invokeArgs: string[] = [
            'build',
            ...(getLogger().logLevelEnabled('debug') ? ['--debug'] : []),
            '--build-dir',
            this.args.buildDir,
            '--template',
            this.args.templatePath,
        ]

        pushIf(invokeArgs, !!this.args.baseDir, '--base-dir', this.args.baseDir!)
        pushIf(invokeArgs, !!this.args.dockerNetwork, '--docker-network', this.args.dockerNetwork!)
        pushIf(invokeArgs, !!this.args.useContainer, '--use-container')
        pushIf(invokeArgs, !!this.args.skipPullImage, '--skip-pull-image')
        pushIf(invokeArgs, !!this.args.manifestPath, '--manifest', this.args.manifestPath!)
        pushIf(
            invokeArgs,
            !!this.args.parameterOverrides && this.args.parameterOverrides.length > 0,
            '--parameter-overrides',
            ...(this.args.parameterOverrides ?? [])
        )
        invokeArgs.push(...(this.args.extraArgs ?? []))

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            ...this.args.environmentVariables,
        }

        const checkFailure = (text: string): void => {
            if (text.match(/(RuntimeError: Container does not exist)/)) {
                this.args.invoker.stop()
                this._failure = localize(
                    'AWS.sam.build.failure.diskSpace',
                    '"sam build" failed. Check system disk space.'
                )
            }
        }

        const childProcessResult = await this.args.invoker.invoke({
            spawnOptions: { env },
            arguments: invokeArgs,
            onStdout: checkFailure,
            onStderr: checkFailure,
        })

        if (this._failure) {
            return -1
        }
        logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
        return childProcessResult.exitCode
    }

    private async validate(): Promise<void> {
        if (!(await this.context.file.fileExists(this.args.templatePath))) {
            const logger: Logger = getLogger()

            const err = new Error(`template path does not exist: ${this.args.templatePath}`)
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
