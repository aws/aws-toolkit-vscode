/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpawnOptions } from 'child_process'
import { getLogger } from '../../logger'
import { getUserAgent } from '../../telemetry/util'
import { ChildProcessResult, ChildProcessOptions } from '../../utilities/childProcess'
import { ErrorInformation, ToolkitError } from '../../errors'
import globals from '../../extensionGlobals'
import { isAutomation } from '../../vscode/env'

/** Generic SAM CLI invocation error. */
export class SamCliError extends ToolkitError.named('SamCliError') {
    public constructor(message?: string, info?: ErrorInformation) {
        super(message ?? 'SAM CLI failed', { ...info, code: 'SamCliFailed' })
    }
}

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
    const msg = message ? message : 'SAM CLI failed'
    return new SamCliError(msg)
}

export function logAndThrowIfUnexpectedExitCode(r: ChildProcessResult, expectedExitCode: number): void {
    if (r.exitCode === expectedExitCode) {
        return
    }

    const errIndented = r.stderr.replace(/\n/g, '\n    ').trim()
    const outIndented = r.stdout.replace(/\n/g, '\n    ').trim()

    getLogger().error(`SAM CLI failed (exitcode: ${r.exitCode}, expected ${expectedExitCode}): ${r.error?.message ?? ''}
    stdout:
    ${outIndented}
    stderr:
    ${errIndented}
`)

    const message = r.error instanceof Error ? r.error.message : collectSamErrors(r.stderr).join('\n')
    throw makeUnexpectedExitCodeError(message)
}

/**
 * Collect known error messages from sam cli output, so they can be surfaced to the user.
 *
 * @param samOutput SAM CLI output containing potential error messages
 */
export function collectSamErrors(samOutput: string): string[] {
    const lines = samOutput.split('\n')
    const matchedLines: string[] = []
    const matchers = [matchSamError, matchAfterEscapeSeq]
    for (const line of lines) {
        for (const m of matchers) {
            const match = m(line)
            if (match && match.trim() !== '') {
                matchedLines.push(match)
                break // Skip remaining matchers, go to next line.
            }
        }
    }
    return matchedLines
}

/** All accepted escape sequences. */
const yellowForeground = '[33m'
const acceptedSequences = [yellowForeground]

/** Returns text after a known escape sequence, or empty string. */
function matchAfterEscapeSeq(text: string, sequences = acceptedSequences): string {
    text = text.trim()
    const escapeInDecimal = 27
    if (text.codePointAt(0) !== escapeInDecimal) {
        return ''
    }

    const remainingText = text.substring(1)
    for (const seq of sequences) {
        if (remainingText.startsWith(seq)) {
            return remainingText.substring(seq.length).trim()
        }
    }
    return ''
}

function matchSamError(text: string): string {
    // These should be ordered by "specificity", to make the result more relevant for users.
    const patterns = [
        /\s*(Running.*requires Docker\.?)/,
        /\s*(Docker.*not reachable\.?)/,
        /\bError:\s*(.*)/, // Goes last because it is the least specific.
    ]
    for (const re of patterns) {
        const match = text.match(re)
        if (match?.[1]) {
            // Capture group 1 is the first (…) group in the regex pattern.
            return match[1].trim() // Return _only_ the matched text. The rest is noise.
        }
    }
    return ''
}

export async function addTelemetryEnvVar(options: SpawnOptions | undefined): Promise<SpawnOptions> {
    const telemetryEnabled = globals.telemetry.telemetryEnabled && !isAutomation()
    // If AWS Toolkit telemetry was disabled, implicit dependencies (such as SAM CLI) should inherit that choice.
    const samEnv = telemetryEnabled ? {} : { SAM_CLI_TELEMETRY: '0' }
    return {
        ...options,
        env: {
            AWS_TOOLING_USER_AGENT: await getUserAgent({ includeClientId: false }),
            ...samEnv,
            ...options?.env,
        },
    }
}
