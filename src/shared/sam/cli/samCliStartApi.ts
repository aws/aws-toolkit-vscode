/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileOrFolderExists } from '../../filesystemUtilities'
import { getLogger } from '../../logger'
import { pushIf } from '../../utilities/collectionUtils'

export interface SamCliStartApiArguments {
    /**
     * Location of the SAM Template to invoke locally against.
     */
    templatePath: string
    /**
     * Location of the file containing the environment variables to invoke the Lambda Function against.
     */
    environmentVariablePath?: string
    /**
     * Environment variables set when invoking the SAM process (NOT passed to the Lambda).
     */
    environmentVariables?: NodeJS.ProcessEnv
    /** Local API webserver port. */
    port?: string
    /**
     * When specified, starts the Lambda function container in debug mode and exposes this port on the local host.
     */
    debugPort?: string
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
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]
    /** SAM args specified by user (`sam.localArguments`). */
    extraArgs?: string[]
    /** Path to the container environment variable file */
    containerEnvFile?: string
    /** Debug session name */
    name?: string
}

/**
 * Build and validate `sam local start-api` arguments
 */
export async function buildSamCliStartApiArguments(args: SamCliStartApiArguments): Promise<string[]> {
    args.skipPullImage = args.skipPullImage === true

    await validate(args.templatePath)

    const invokeArgs = [
        'local',
        'start-api',
        ...(getLogger().logLevelEnabled('debug') ? ['--debug'] : []),
        '--template',
        args.templatePath,
    ]

    pushIf(invokeArgs, !!args.environmentVariablePath, '--env-vars', args.environmentVariablePath)
    pushIf(invokeArgs, !!args.port, '--port', args.port!)
    pushIf(invokeArgs, !!args.debugPort, '--debug-port', args.debugPort!)
    pushIf(invokeArgs, !!args.dockerNetwork, '--docker-network', args.dockerNetwork!)
    pushIf(invokeArgs, !!args.skipPullImage, '--skip-pull-image')
    pushIf(invokeArgs, !!args.debuggerPath, '--debugger-path', args.debuggerPath!)
    pushIf(invokeArgs, !!args.debugArgs, '--debug-args', ...(args.debugArgs ?? []))
    pushIf(invokeArgs, !!args.containerEnvFile, '--container-env-vars', args.containerEnvFile)
    pushIf(
        invokeArgs,
        !!args.parameterOverrides && args.parameterOverrides.length > 0,
        '--parameter-overrides',
        ...(args.parameterOverrides ?? [])
    )
    invokeArgs.push(...(args.extraArgs ?? []))

    return invokeArgs
}

async function validate(templatePath: string): Promise<void> {
    if (!(await fileOrFolderExists(templatePath))) {
        throw new Error(`template path does not exist: ${templatePath}`)
    }
}
