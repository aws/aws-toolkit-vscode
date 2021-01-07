/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpawnOptions } from 'child_process'
import { getLogger } from '../../logger'
import { ChildProcessResult, ChildProcessStartArguments } from '../../utilities/childProcess'
import { ChannelLogger } from '../../utilities/vsCodeUtils'

export interface SamCliProcessInvokeOptions {
    spawnOptions?: SpawnOptions
    arguments?: string[]
    /** Optionally log stdout and stderr to the specified logger */
    channelLogger?: ChannelLogger
    onStdout?: ChildProcessStartArguments['onStdout']
    onStderr?: ChildProcessStartArguments['onStderr']
}

export function makeRequiredSamCliProcessInvokeOptions(
    options?: SamCliProcessInvokeOptions
): Required<Omit<SamCliProcessInvokeOptions, 'channelLogger' | 'onStdout' | 'onStderr'>> {
    options = options || {}

    return {
        spawnOptions: options.spawnOptions || {},
        arguments: options.arguments || [],
    }
}

export interface SamCliProcessInvoker {
    invoke(options?: SamCliProcessInvokeOptions): Promise<ChildProcessResult>
    stop(): void
}

export function logAndThrowIfUnexpectedExitCode(processResult: ChildProcessResult, expectedExitCode: number): void {
    if (processResult.exitCode === expectedExitCode) {
        return
    }

    const logger = getLogger()

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
