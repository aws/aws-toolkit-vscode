/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TestLogger } from '../../../../shared/loggerUtils'
import { runSamCliPackage } from '../../../../shared/sam/cli/samCliPackage'
import { assertThrowsError } from '../../utilities/assertUtils'
import { assertArgsContainArgument, MockSamCliProcessInvoker } from './samCliTestUtils'
import {
    assertErrorContainsBadExitMessage,
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker
} from './testSamCliProcessInvoker'

describe('SamCliPackageInvocation', async () => {
    let logger: TestLogger
    let invokeCount: number

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    beforeEach(() => {
        invokeCount = 0
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('includes a template, s3 bucket, output template file, region, and profile ', async () => {
        const invoker = new MockSamCliProcessInvoker(args => {
            invokeCount++
            assertArgsContainArgument(args, '--template-file', 'template')
            assertArgsContainArgument(args, '--s3-bucket', 'bucket')
            assertArgsContainArgument(args, '--output-template-file', 'output')
            assertArgsContainArgument(args, '--region', 'region')
            assertArgsContainArgument(args, '--profile', 'profile')
        })

        await runSamCliPackage(
            {
                sourceTemplateFile: 'template',
                destinationTemplateFile: 'output',
                profile: 'profile',
                region: 'region',
                s3Bucket: 'bucket'
            },
            invoker
        )

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('throws on unexpected exit code', async () => {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})

        const error = await assertThrowsError(async () => {
            await runSamCliPackage(
                {
                    sourceTemplateFile: 'template',
                    destinationTemplateFile: 'output',
                    profile: 'profile',
                    region: 'region',
                    s3Bucket: 'bucket'
                },
                badExitCodeProcessInvoker
            )
        }, 'Expected an error to be thrown')

        assertErrorContainsBadExitMessage(error, badExitCodeProcessInvoker.error.message)
        await assertLogContainsBadExitInformation(logger, badExitCodeProcessInvoker.makeChildProcessResult(), 0)
    })
})
