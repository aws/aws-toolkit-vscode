/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpawnOptions } from 'child_process'
import { BasicLogger, getLogger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'

export interface SamCliProcessInvokeOptions {
    spawnOptions?: SpawnOptions,
    arguments?: string[]
}

export function makeRequiredSamCliProcessInvokeOptions(
    options?: SamCliProcessInvokeOptions
): Required<SamCliProcessInvokeOptions> {
    options = options || {}

    return {
        spawnOptions: options.spawnOptions || {},
        arguments: options.arguments || [],
    }
}

export interface SamCliProcessInvoker {
    invoke(options?: SamCliProcessInvokeOptions): Promise<ChildProcessResult>
}

export function logAndThrowIfUnexpectedExitCode(
    processResult: ChildProcessResult,
    expectedExitCode: number,
    logger: BasicLogger = getLogger(),
): void {
    if (processResult.exitCode === expectedExitCode) { return }

    logger.error(`Unexpected exitcode (${processResult.exitCode}), expecting (${expectedExitCode})`)
    logger.error(`Error: ${processResult.error}`)
    logger.error(`stderr: ${processResult.stderr}`)
    logger.error(`stdout: ${processResult.stdout}`)

    let message: string | undefined

    if (processResult.error instanceof Error) {
        if (processResult.error.message) {
            message = processResult.error.message
        }
    }

    if (!message) {
        message = processResult.stderr || processResult.stdout || 'No message available'
    }

    throw new Error(`Error with child process: ${message}`)
}
