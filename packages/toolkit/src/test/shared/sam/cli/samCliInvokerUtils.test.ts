/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    addTelemetryEnvVar,
    collectSamErrors,
    logAndThrowIfUnexpectedExitCode,
    makeUnexpectedExitCodeError,
} from '../../../../shared/sam/cli/samCliInvokerUtils'
import { getTestLogger } from '../../../globalSetup.test'
import { assertLogContainsBadExitInformation } from './testSamCliProcessInvoker'

describe('logAndThrowIfUnexpectedExitCode', async function () {
    it('does not throw on expected exit code', async function () {
        logAndThrowIfUnexpectedExitCode(
            {
                exitCode: 123,
                error: undefined,
                stderr: '',
                stdout: '',
            },
            123
        )
    })

    it('throws on unexpected exit code', async function () {
        const exitError = new Error('bad result')
        const finalError = makeUnexpectedExitCodeError(exitError.message)
        const childProcessResult = {
            exitCode: 123,
            error: exitError,
            stderr: 'stderr text',
            stdout: 'stdout text',
        }

        assert.throws(
            () => logAndThrowIfUnexpectedExitCode(childProcessResult, 456),
            finalError,
            'Correct error was not thrown'
        )
        await assertLogContainsBadExitInformation(getTestLogger(), childProcessResult, 456)
    })
})

/** Prepends ESC control character to `text`. */
function prependEscapeCode(text: string): string {
    return String.fromCharCode(27) + text
}

describe('collectSamErrors()', async () => {
    it('collects messages', async () => {
        const input = `
        This line is ignored
        foo bar Error: xxx Docker is not reachable!!
        another line
        foo Error: user is bored Error: 
        Error: Running AWS SAM projects locally requires Docker.
        'urllib3.exceptions.ProtocolError: ('Connection aborted.', FileNotFoundError(2, 'No such file or directory'))'
        ok
        ${prependEscapeCode('[33m known escape sequence')}
        ok again
        ${prependEscapeCode('[100m unknown escape sequence')}
        `
        const result = collectSamErrors(input)
        assert.deepStrictEqual(result, [
            'Docker is not reachable',
            'user is bored Error:',
            'Running AWS SAM projects locally requires Docker.',
            'known escape sequence',
        ])
    })
})

describe('addTelemetryEnvVar', async function () {
    it('adds a new variable, preserving the existing contents', async function () {
        const result = await addTelemetryEnvVar({
            cwd: '/foo',
            env: { AWS_REGION: 'us-east-1' },
        })

        assert.deepStrictEqual(result, {
            cwd: '/foo',
            env: {
                AWS_TOOLING_USER_AGENT: result.env?.['AWS_TOOLING_USER_AGENT'],
                SAM_CLI_TELEMETRY: '0',
                AWS_REGION: 'us-east-1',
            },
        })
    })
})
