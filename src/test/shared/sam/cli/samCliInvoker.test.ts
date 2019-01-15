/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import '../../vscode/initialize'

import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'
import { DefaultSamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvoker'
import { assertRejects } from '../../utilities/assertUtils'

describe('DefaultSamCliInvoker', async () => {
    it('throws if sam cli location is not known', async () => {
        const config: SamCliConfiguration = {
            getSamCliLocation: () => undefined
        } as any as SamCliConfiguration

        const invoker = new DefaultSamCliProcessInvoker(config)

        await assertRejects(async () => await invoker.invoke())
    })
})
