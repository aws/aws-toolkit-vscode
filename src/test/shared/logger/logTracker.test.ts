/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import * as fs from 'fs-extra'
import { WinstonToolkitLogger } from '../../../shared/logger/winstonToolkitLogger'
import { LogTracker, LogTrackerRecord, getLogTracker, parseLogObject } from '../../../shared/logger/logTracker'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'

describe('LogTracker', function() {
    let tempFolder: string
    let tempLogPath: string
    let tempFileCounter: number = 0
    let logger: WinstonToolkitLogger
    let logTracker: LogTracker

    before(async function() {
        tempFolder = await filesystemUtilities.makeTemporaryToolkitFolder()
        logger = new WinstonToolkitLogger("info")
        logTracker = getLogTracker()
    })

    beforeEach(async function() {
        tempLogPath = path.join(tempFolder, `temp-${++tempFileCounter}.log`)
        logger.logToFile(tempLogPath, "logged", parseLogObject)
        logger.error(new Error("Test start"))
        const logExists: boolean | undefined = await waitUntil(
            () => filesystemUtilities.fileExists(tempLogPath), 
            { timeout: 1000, interval: 10, truthy: true }
        )

        if (!logExists) {
            throw new Error("Log file wasn't created during test")
        }
    })

    after(async function() {
        if (await filesystemUtilities.fileExists(tempFolder)) {
            await fs.remove(tempFolder)
        }
    })

    it("get info log message", async function() {
        const record: LogTrackerRecord = logTracker.registerLog()

        logger.info("test", { logID: record.logID })
        const msg: string | undefined = await record.logMessage.then(m => m)
        assert.notStrictEqual(msg, undefined)
    })

    it("debug log message is undefined", async function() {
        const record: LogTrackerRecord = logTracker.registerLog(50, 5)

        logger.debug("debug test", { logID: record.logID })
        const msg: string | undefined = await record.logMessage.then(m => m)
        assert.strictEqual(msg, undefined)
    })

    it("retrieve multiple unique logs with other logs", async function() {
        const set: Set<string> = new Set<string>()

        for (let i = 0; i < 5; i++) {
            const record: LogTrackerRecord = logTracker.registerLog(1000, 5)

            logger.info(`log ${i}`, { logID: record.logID })
            logger.error("error log")
            logger.debug("debug log")

            const msg: string | undefined = await record.logMessage.then(m => m)
            assert.notStrictEqual(msg, undefined)
            assert.strictEqual(set.has(msg!), false)
            set.add(msg!)
        }
    })

    it("can find log within file", async function() {
        // Fill the file with messsages, then try to find the middle log
        const logMessages: Promise<string | undefined>[] = new Array<Promise<string | undefined>>()

        for (let i = 0; i < 10; i++) {
            const record: LogTrackerRecord = logTracker.registerLog(1000, 5)
            logger.error(`error message ${i}`, { logID: record.logID })
            logger.warn('warning message')
            logMessages.push(record.logMessage)
        }

        const middleMsg: string | undefined = await logMessages[Math.floor(logMessages.length / 2)].then(m => m)
        const fileText: string = await filesystemUtilities.readFileAsString(tempLogPath)
        assert.notStrictEqual(middleMsg, undefined)
        assert.strictEqual(fileText.includes(middleMsg!), true)
    })
})
