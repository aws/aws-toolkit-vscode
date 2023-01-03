/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpawnOptions } from 'child_process'
import { getLogger } from '../../logger'
import { ChildProcessResult, ChildProcessOptions } from '../../utilities/childProcess'

export interface SamCliProcessInvokeOptions {
    spawnOptions?: SpawnOptions
    arguments?: string[]
    onStdout?: ChildProcessOptions['onStdout']
    onStderr?: ChildProcessOptions['onStderr']
    /** Log command invocations (default: true). */
    logging?: boolean
}

export function makeRequiredSamCliProcessInvokeOptions(
    options?: SamCliProcessInvokeOptions
): Required<Omit<SamCliProcessInvokeOptions, 'channelLogger' | 'onStdout' | 'onStderr' | 'logging'>> {
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

export function makeUnexpectedExitCodeError(message: string): Error {
    return new Error(`Error with child process: ${message}`)
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
    const usefulErrors = collectAcceptedErrorMessages(processResult.stderr).join('\n')
    throw makeUnexpectedExitCodeError(message ?? usefulErrors)
}

/**
 * Collect known errors messages from a sam error message
 * that may have multiple errors in one message.
 * @param errors A string that can have multiple error messages
 */
export function collectAcceptedErrorMessages(errorMessage: string): string[] {
    const errors = errorMessage.split('\n')
    const shouldCollectFuncs = [startsWithEscapeSequence, startsWithError]
    return errors.filter(error => {
        return shouldCollectFuncs.some(shouldCollect => {
            return shouldCollect(error)
        })
    })
}

/**
 * All accepted escape sequences.
 */
const yellowForeground = '[33m'
const acceptedSequences = [yellowForeground]

/**
 * Returns true if text starts with an escape
 * sequence with one of the accepted sequences.
 */
function startsWithEscapeSequence(text: string, sequences = acceptedSequences): boolean {
    const escapeInDecimal = 27
    if (text.charCodeAt(0) !== escapeInDecimal) {
        return false
    }

    const remainingText = text.substring(1)
    return sequences.some(code => {
        return remainingText.startsWith(code)
    })
}

function startsWithError(text: string): boolean {
    return text.startsWith('Error:')
}
