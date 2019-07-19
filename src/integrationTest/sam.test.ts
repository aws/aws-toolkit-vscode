/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { TIMEOUT } from './integrationTestsUtilities'

describe('SAM', async () => {
    it('Creates a NodeJs SAM app', async () => {
        const initArguments: SamCliInitArgs = {
            name: 'test',
            location: './temp',
            runtime: 'python3.7'
        }
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker)

    }).timeout(TIMEOUT)
})
