/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestLogger } from '../../../../shared/loggerUtils'
import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'
import {
    DefaultSamCliProcessInvoker,
    resolveSamCliProcessInvokerContext
} from '../../../../shared/sam/cli/samCliInvoker'
import { assertRejects } from '../../utilities/assertUtils'

describe('DefaultSamCliProcessInvoker', async () => {
    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('throws if sam cli location is not known', async () => {
        const context = resolveSamCliProcessInvokerContext({
            cliConfig: ({
                getSamCliLocation: () => undefined
            } as any) as SamCliConfiguration
        })

        const invoker = new DefaultSamCliProcessInvoker(context)

        await assertRejects(async () => await invoker.invoke())
    })
})
