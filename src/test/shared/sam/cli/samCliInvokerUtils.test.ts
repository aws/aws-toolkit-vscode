/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    collectAcceptedErrorMessages,
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

/**
 * Returns a string with the 'Escape' character
 * prepended to the given text.
 *
 * This exists because using '\e' does not
 * work.
 */
function prependEscapeCode(text: string): string {
    return String.fromCharCode(27) + text
}

describe('collectAcceptedErrorMessages()', async () => {
    let result: string[]

    before(async () => {
        const input = [
            prependEscapeCode('[33m This is an accepted escape sequence'),
            prependEscapeCode('[100m This is not an accepted escape sequence'),
            'This will be ignored',
            'Error: This is accepted due to the prefix',
        ].join('\n')
        result = collectAcceptedErrorMessages(input)
    })

    it('has the expected amount of messages', async () => {
        assert.strictEqual(result.length, 2)
    })
    it('collects the "Error:" prefix', async () => {
        assert(result.includes('Error: This is accepted due to the prefix'))
    })
    it('collects accepted escape sequence prefixes', async () => {
        assert(result.includes(prependEscapeCode('[33m This is an accepted escape sequence')))
    })
    it('ignores non-accepted escape sequence prefixes', async () => {
        assert(!result.includes(prependEscapeCode('[100m This is not an accepted escape sequence')))
    })
})
