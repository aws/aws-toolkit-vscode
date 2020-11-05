/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as fs from 'fs-extra'
import { join } from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { Logger } from '../../../shared/logger'
import { makeLogger } from '../../../shared/logger/activation'
import { WinstonToolkitLogger } from '../../../shared/logger/winstonToolkitLogger'
import { MockOutputChannel } from '../../mockOutputChannel'

describe('makeLogger', () => {
    let tempFolder: string
    let testLogger: Logger | undefined

    before(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        testLogger = makeLogger('debug', join(tempFolder, 'log.txt'), new MockOutputChannel())
    })

    after(async () => {
        if (testLogger && testLogger instanceof WinstonToolkitLogger) {
            testLogger.dispose()
        }

        testLogger = undefined
        await fs.remove(tempFolder)
    })

    it('creates a logger object', () => {
        assert.notStrictEqual(testLogger, undefined)
        assert.ok(testLogger instanceof WinstonToolkitLogger)
    })
})
