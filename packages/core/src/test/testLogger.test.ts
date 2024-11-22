/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getLogger } from '../shared'
import { assertLogsContain, getTestLogger } from './globalSetup.test'

describe('TestLogger', function () {
    describe('assertLogsContain', function () {
        it('checks only at specified log level', function () {
            const logger = getLogger()
            logger.info('here is some info')
            logger.debug('here is some debug')

            assertLogsContain('here is some info', true, 'info')
            assert.throws(() => assertLogsContain('here is some info', true, 'debug'))

            assertLogsContain('here is some debug', true, 'debug')
            assert.throws(() => assertLogsContain('here is some debug', true, 'info'))
        })

        it('only requires substring without exactMatch=true', function () {
            const logger = getLogger()
            logger.info('here is some info')
            logger.debug('here is some debug')

            assertLogsContain('some info', false, 'info')
            assertLogsContain('some debug', false, 'debug')
        })
    })

    it('formats objects into logs', function () {
        const testObj = {
            info: 'some info',
        }

        getLogger().debug('here is my testObj: %O', testObj)
        assertLogsContain(`here is my testObj: { info: 'some info' }`, true, 'debug')
    })

    it('has one logging entry for each logging statement', function () {
        const logger = getLogger()
        const startingEntries = getTestLogger().getLoggedEntries().length
        logger.info('here is some info %O', { info: 'this is info' })
        logger.debug('here is some debug %O', { debug: 'this is debug' })
        assert.strictEqual(getTestLogger().getLoggedEntries().length - startingEntries, 2)
    })

    it('returns entry number on each log statement', function () {
        const logger = getLogger()
        const startingEntryNumber = getTestLogger().getLoggedEntries().length
        const entry1 = logger.info('here is some info %O', { info: 'this is info' })
        const entry2 = logger.debug('here is some debug %O', { debug: 'this is debug' })
        const entry3 = logger.debug('here is some warn %O', { warn: 'this is warn' })
        assert.strictEqual(entry1, startingEntryNumber)
        assert.strictEqual(entry2, startingEntryNumber + 1)
        assert.strictEqual(entry3, startingEntryNumber + 2)
    })
})
