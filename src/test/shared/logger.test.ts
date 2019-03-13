/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import * as filesystemUtilities from '../../shared/filesystemUtilities'
import * as logger from '../../shared/logger'

describe('logger', () => {

    let tempFolder: string
    let testLogger: logger.Logger

    before(async () => {
        tempFolder = await filesystemUtilities.makeTemporaryToolkitFolder()
        testLogger = logger.createLogger({
            // no output channel since we can't check the output channel's content...
            logPath: path.join(tempFolder, 'temp.log'),
            logLevel: 'debug'
        })
    })

    after(async () => {
        testLogger.releaseLogger()
        if (await filesystemUtilities.fileExists(tempFolder)) {
            await del(tempFolder, { force: true })
        }
    })

    it('creates a logger object', () => {
        assert.notStrictEqual(testLogger, undefined)
    })

    it('logs debug info to a file', async () => {
        const text = 'logs debug info to a file'
        testLogger.debug(text)
        await waitForLogFile(testLogger.logPath as string)
        const logText = await filesystemUtilities.readFileAsString(testLogger.logPath as string)
        assert.strictEqual(logText.includes(`[DEBUG]: ${text}`), true)
    })

    it('logs verbose info to a file', async () => {
        const text = 'logs verbose info to a file'
        testLogger.verbose(text)
        await waitForLogFile(testLogger.logPath as string)
        const logText = await filesystemUtilities.readFileAsString(testLogger.logPath as string)
        assert.strictEqual(logText.includes(`[VERBOSE]: ${text}`), true)
    })

    it('logs info to a file', async () => {
        const text = 'logs info to a file'
        testLogger.info(text)
        await waitForLogFile(testLogger.logPath as string)
        const logText = await filesystemUtilities.readFileAsString(testLogger.logPath as string)
        assert.strictEqual(logText.includes(`[INFO]: ${text}`), true)
    })

    it('logs warnings to a file', async () => {
        const text = 'logs warning to a file'
        testLogger.warn(text)
        await waitForLogFile(testLogger.logPath as string)
        const logText = await filesystemUtilities.readFileAsString(testLogger.logPath as string)
        assert.strictEqual(logText.includes(`[WARN]: ${text}`), true)
    })

    it('logs errors to a file', async () => {
        const text = 'logs errors to a file'
        testLogger.error(new Error(text))
        await waitForLogFile(testLogger.logPath as string)
        const logText = await filesystemUtilities.readFileAsString(testLogger.logPath as string)
        assert.strictEqual(logText.includes(`[ERROR]: Error: ${text}`), true)
        // check stack trace
        assert.strictEqual(logText.includes('logger.test'), true)
    })

    it('logs multiple pieces of info to a file', async () => {
        testLogger.info('logs', 'multiple', 'pieces', 'of', 'info', 'to', 'a', 'file')
        await waitForLogFile(testLogger.logPath as string)
        const logText = await filesystemUtilities.readFileAsString(testLogger.logPath as string)
        assert.strictEqual(logText.includes('[INFO]: logs multiple pieces of info to a file'), true)
    })

    it('does not log levels lower than the designated level', async () => {
        const text = 'does not log levels lower than the designated level'
        const errorOnlyLogger = logger.createLogger({
            logLevel: 'error',
            logPath: path.join(tempFolder, 'errorsOnly.log')
        })
        errorOnlyLogger.verbose(text)
        errorOnlyLogger.error(new Error(text))
        await waitForLogFile(errorOnlyLogger.logPath as string)
        const logText = await filesystemUtilities.readFileAsString(errorOnlyLogger.logPath as string)
        assert.strictEqual(logText.includes(`[VERBOSE]: ${text}`), false)
        assert.strictEqual(logText.includes(`[ERROR]: Error: ${text}`), true)
        errorOnlyLogger.releaseLogger()
    })

    async function waitForLogFile(logPath: string): Promise<void> {

        const timeoutPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
                () => {
                    clearTimeout(timeout)
                    reject('Log file not found in 1500 ms')
                },
                1500
            )
        })

        const fileExistsPromise = new Promise<void>(async (resolve, reject) => {
            while (true) {
                if (await filesystemUtilities.fileExists(logPath)) {
                    resolve()
                }
            }
        })

        return Promise.race([timeoutPromise, fileExistsPromise])
    }
})
