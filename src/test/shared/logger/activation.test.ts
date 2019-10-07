/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Logger } from '../../../shared/logger'
import { createLogger } from '../../../shared/logger/activation'
import { WinstonToolkitLogger } from '../../../shared/logger/winstonToolkitLogger'

describe('createLogger', () => {
    let testLogger: Logger | undefined

    before(async () => {
        testLogger = createLogger({
            logLevel: 'debug'
        })
    })

    after(async () => {
        testLogger = undefined
    })

    it('creates a logger object', () => {
        assert.notStrictEqual(testLogger, undefined)
        assert.ok(testLogger instanceof WinstonToolkitLogger)
    })
})
