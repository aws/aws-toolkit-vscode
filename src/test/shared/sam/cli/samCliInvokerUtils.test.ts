/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
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
