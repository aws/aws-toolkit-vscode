/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'
import { DefaultSamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvoker'
import { SamCliVersion } from '../../../../shared/sam/cli/samCliVersion'
import { SamCliVersionValidator } from '../../../../shared/sam/cli/samCliVersionValidator'
import { assertRejects } from '../../utilities/assertUtils'

describe('DefaultSamCliInvoker', async () => {
    it('throws if sam cli location is not known', async () => {
        const config: SamCliConfiguration = {
            getSamCliLocation: () => undefined,
            validator: new SamCliVersionValidator({
                getSamCliVersion: async () => SamCliVersion.MINIMUM_SAM_CLI_VERSION_INCLUSIVE
            })
        } as any as SamCliConfiguration

        const invoker = new DefaultSamCliProcessInvoker(config)

        await assertRejects(async () => await invoker.invoke())
    })

    it('returns an error if the AWS Toolkit is out of date', async () => {
        const testHighLevel = '999999.9999.999999'
        const config: SamCliConfiguration = {
            validator: new SamCliVersionValidator({
                getSamCliVersion: async () => testHighLevel
            })
        } as any as SamCliConfiguration

        const invoker = new DefaultSamCliProcessInvoker(config)

        const result = await invoker.invoke()
        assert.strictEqual(result.exitCode, 1)
        assert.strictEqual(result.stderr, 'AWS Toolkit is out of date')
    })

    it('returns an error if the SAM CLI is out of date', async () => {
        const testLowLevel = '0.0.1'
        const config: SamCliConfiguration = {
            validator: new SamCliVersionValidator({
                getSamCliVersion: async () => testLowLevel
            })
        } as any as SamCliConfiguration

        const invoker = new DefaultSamCliProcessInvoker(config)

        const result = await invoker.invoke()
        assert.strictEqual(result.exitCode, 1)
        assert.strictEqual(result.stderr, 'SAM CLI is out of date')
    })
})
