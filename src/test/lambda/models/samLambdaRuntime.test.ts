/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { compareSamLambdaRuntime } from '../../../lambda/models/samLambdaRuntime'

describe('compareSamLambdaRuntime', async () => {
    it('node 8 < node 10', async () => {
        assert.ok(compareSamLambdaRuntime('nodejs8.10', 'nodejs10.x') < 0, 'expected node 8 < node 10')
        assert.ok(compareSamLambdaRuntime('nodejs10.x', 'nodejs8.10') > 0, 'expected node 8 < node 10')
    })
})
