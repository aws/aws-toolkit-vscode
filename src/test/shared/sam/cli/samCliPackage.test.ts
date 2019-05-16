/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { SamCliPackageInvocation } from '../../../../shared/sam/cli/samCliPackage'
import { MockSamCliProcessInvoker } from './samCliTestUtils'

describe('SamCliPackageInvocation', async () => {

    it('includes a template, s3 bucket, output template file, region, and profile ', async () => {
        const invoker = new MockSamCliProcessInvoker(
            args => {
                const templateIndex = args.findIndex(arg => arg === '--template-file')
                const s3Index = args.findIndex(arg => arg === '--s3-bucket')
                const outputIndex = args.findIndex(arg => arg === '--output-template-file')
                const regionIndex = args.findIndex(arg => arg === '--region')
                const profileIndex = args.findIndex(arg => arg === '--profile')
                assert.strictEqual(args[templateIndex + 1], 'template')
                assert.strictEqual(args[s3Index + 1], 'bucket')
                assert.strictEqual(args[outputIndex + 1], 'output')
                assert.strictEqual(args[regionIndex + 1], 'region')
                assert.strictEqual(args[profileIndex + 1], 'profile')
            }
        )

        const invocation = new SamCliPackageInvocation(
            'template',
            'output',
            'bucket',
            invoker,
            'region',
            'profile'
        )

        await invocation.execute()
    })
})
