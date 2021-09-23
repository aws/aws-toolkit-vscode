/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getNullLogger, Logger } from '../../../shared/logger'
import { logging } from '../../../shared/utilities/decorators'

describe('@logging', function () {
    @logging
    class Test {
        public logger: Logger

        constructor() {
            this.logger = getNullLogger()
        }
    }

    it('sets name of logger', function () {
        assert.strictEqual(new Test().logger.name, 'Test')
    })

    @logging
    class ChildTest extends Test {
        constructor() {
            super()
        }
    }

    it('can override parent decorators', function () {
        assert.strictEqual(new ChildTest().logger.name, 'ChildTest')
    })

    @logging
    class BadType {
        public logger!: Logger
    }

    it('throws if trying to access unassigned logger', function () {
        assert.throws(() => new BadType().logger)
    })
})
