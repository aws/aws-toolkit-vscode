/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'
import {
    DefaultSamCliProcessInvoker,
    resolveSamCliProcessInvokerContext,
} from '../../../../shared/sam/cli/samCliInvoker'
import { assertRejects } from '../../utilities/assertUtils'

describe('DefaultSamCliProcessInvoker', async () => {
    it('throws if sam cli location is not known', async () => {
        const context = resolveSamCliProcessInvokerContext({
            cliConfig: ({
                getSamCliLocation: () => undefined,
            } as any) as SamCliConfiguration,
        })

        const invoker = new DefaultSamCliProcessInvoker(context)

        await assertRejects(async () => await invoker.invoke())
    })
})
