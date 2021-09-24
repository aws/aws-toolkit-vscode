/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getNullLogger, Logger } from '../../../shared/logger'
import { NullLogger } from '../../../shared/logger/logger'
import { logging } from '../../../shared/utilities/decorators'

describe('@logging', function () {
    @logging
    class Test {
        public logger: NullLogger

        constructor() {
            this.logger = getNullLogger()
        }
    }

    it('add name metadata to log methods', function () {
        const logger = new Test().logger
        logger.info('some info')
        assert.deepStrictEqual(logger.lastMetadata?.pop(), { name: 'Test' })
    })

    @logging
    class ChildTest extends Test {
        constructor() {
            super()
        }
    }

    it('can override parent decorators', function () {
        const logger = new ChildTest().logger
        logger.error('some info')
        assert.deepStrictEqual(logger.lastMetadata?.pop(), { name: 'ChildTest' })
    })

    it('does not reinstrument on reassignment', function () {
        const base = new Test()
        const logger = new ChildTest().logger
        base.logger = logger
        base.logger.info('some info')
        assert.deepStrictEqual(logger.lastMetadata?.pop(), { name: 'ChildTest' })
    })

    @logging
    class BadType {
        public logger!: Logger
    }

    it('throws if trying to access unassigned logger', function () {
        assert.throws(() => new BadType().logger)
    })
})
