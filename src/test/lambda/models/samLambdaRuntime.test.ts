/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { compareSamLambdaRuntime } from '../../../lambda/models/samLambdaRuntime'

describe('compareSamLambdaRuntime', async () => {
    it('node 6 < node 8', async () => {
        assert.ok(compareSamLambdaRuntime('nodejs6.10', 'nodejs8.10') < 0, 'expected node 6 < node 8')
        assert.ok(compareSamLambdaRuntime('nodejs8.10', 'nodejs6.10') > 0, 'expected node 6 < node 8')
    })

    it('node 6 < node 10', async () => {
        assert.ok(compareSamLambdaRuntime('nodejs6.10', 'nodejs10.x') < 0, 'expected node 6 < node 10')
        assert.ok(compareSamLambdaRuntime('nodejs10.x', 'nodejs6.10') > 0, 'expected node 6 < node 10')
    })

    it('node 8 < node 10', async () => {
        assert.ok(compareSamLambdaRuntime('nodejs8.10', 'nodejs10.x') < 0, 'expected node 8 < node 10')
        assert.ok(compareSamLambdaRuntime('nodejs10.x', 'nodejs8.10') > 0, 'expected node 8 < node 10')
    })
})
