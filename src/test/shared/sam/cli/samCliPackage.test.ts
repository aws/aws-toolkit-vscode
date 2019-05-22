/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { runSamCliPackage } from '../../../../shared/sam/cli/samCliPackage'
import { assertArgsContainArgument, MockSamCliProcessInvoker } from './samCliTestUtils'

describe('SamCliPackageInvocation', async () => {

    let invokeCount: number

    beforeEach(() => {
        invokeCount = 0
    })

    it('includes a template, s3 bucket, output template file, region, and profile ', async () => {
        const invoker = new MockSamCliProcessInvoker(
            args => {
                invokeCount++
                assertArgsContainArgument(args, '--template-file', 'template')
                assertArgsContainArgument(args, '--s3-bucket', 'bucket')
                assertArgsContainArgument(args, '--output-template-file', 'output')
                assertArgsContainArgument(args, '--region', 'region')
                assertArgsContainArgument(args, '--profile', 'profile')
            }
        )

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
})
