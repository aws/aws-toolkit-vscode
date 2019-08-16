/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestLogger } from '../../../../shared/loggerUtils'
import { logAndThrowIfUnexpectedExitCode } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { assertThrowsError } from '../../utilities/assertUtils'
import { assertErrorContainsBadExitMessage, assertLogContainsBadExitInformation } from './testSamCliProcessInvoker'

describe('logAndThrowIfUnexpectedExitCode', async () => {
    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('does not throw on expected exit code', async () => {
        logAndThrowIfUnexpectedExitCode(
            {
                exitCode: 123,
                error: undefined,
                stderr: '',
                stdout: ''
            },
            123
        )
    })

    it('throws on unexpected exit code', async () => {
        const exitError = new Error('bad result')
        const childProcessResult = {
            exitCode: 123,
            error: exitError,
            stderr: 'stderr text',
            stdout: 'stdout text'
        }

        const error = await assertThrowsError(async () => {
            logAndThrowIfUnexpectedExitCode(childProcessResult, 456)
        }, 'Expected an error to be thrown')

        assertErrorContainsBadExitMessage(error, exitError.message)
        await assertLogContainsBadExitInformation(logger, childProcessResult, 456)
    })
})
