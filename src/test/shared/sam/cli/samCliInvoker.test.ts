/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Stats } from 'fs'
import { TestLogger } from '../../../../shared/loggerUtils'
import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'
import {
    DefaultSamCliProcessInvoker,
    makeSamCliProcessInvokerContext
} from '../../../../shared/sam/cli/samCliInvoker'
import { assertRejects } from '../../utilities/assertUtils'

describe('DefaultSamCliInvoker', async () => {

    let logger: TestLogger

    before( async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('throws if sam cli location is not known', async () => {
        const context = makeSamCliProcessInvokerContext({
            cliConfig: {
                getSamCliLocation: () => undefined
            } as any as SamCliConfiguration
        })

        const invoker = new DefaultSamCliProcessInvoker(context)

        await assertRejects(async () => await invoker.invoke())
    })

    it('returns an error if the AWS Toolkit is out of date', async () => {
        const testHighLevel = '999999.9999.999999'
        const testDate = new Date(12345)
        const testStat = new Stats()
        testStat.mtime = testDate

        const context = makeSamCliProcessInvokerContext({
            cliConfig: {
                getSamCliLocation: () => 'filler'
            } as any as SamCliConfiguration,
            cliUtils: {
                stat: async () => testStat
            },
            cliInfo: { info: { version: testHighLevel }, lastModified: testDate }
        })

        const invoker = new DefaultSamCliProcessInvoker(context)

        const result = await invoker.invoke()
        assert.strictEqual(result.exitCode, 1)
        assert.strictEqual(result.stderr, 'AWS Toolkit is out of date')
    })

    it('returns an error if the SAM CLI is out of date', async () => {
        const testLowLevel = '0.0.1'
        const testDate = new Date(12345)
        const testStat = new Stats()
        testStat.mtime = testDate

        const context = makeSamCliProcessInvokerContext({
            cliConfig: {
                getSamCliLocation: () => 'filler'
            } as any as SamCliConfiguration,
            cliUtils: {
                stat: async () => testStat
            },
            cliInfo: { info: { version: testLowLevel }, lastModified: testDate }
        })

        const invoker = new DefaultSamCliProcessInvoker(context)

        const result = await invoker.invoke()
        assert.strictEqual(result.exitCode, 1)
        assert.strictEqual(result.stderr, 'SAM CLI is out of date')
    })
})
