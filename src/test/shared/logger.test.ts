/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import * as filesystemUtilities from '../../shared/filesystemUtilities'
import { createLogger, Logger, WinstonToolkitLogger } from '../../shared/logger'
import { assertThrowsError } from './utilities/assertUtils'

describe('logger', () => {
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

describe('WinstonToolkitLogger', () => {
    let tempFolder: string

    before(async () => {
        tempFolder = await filesystemUtilities.makeTemporaryToolkitFolder()
    })

    after(async () => {
        if (await filesystemUtilities.fileExists(tempFolder)) {
            await del(tempFolder, { force: true })
        }
    })

    it('creates an object', () => {
        assert.notStrictEqual(new WinstonToolkitLogger('info'), undefined)
    })

    it('throws when logging to a disposed object', async () => {
        const logger = new WinstonToolkitLogger('info')
        logger.dispose()

        await assertThrowsError(async () => logger.info('This should not log'))
    })

    describe('logs to a file', async () => {
        let tempLogPath: string
        let tempFileCounter = 0
        let testLogger: WinstonToolkitLogger | undefined

        beforeEach(async () => {
            tempLogPath = path.join(tempFolder, `temp-${++tempFileCounter}.log`)
        })

        afterEach(async () => {
            if (testLogger) {
                testLogger.dispose()
                testLogger = undefined
            }
        })

        it('does not log a lower level', async () => {
            const debugMessage = 'debug message'
            const errorMessage = 'error message'

            testLogger = new WinstonToolkitLogger('error')
            testLogger.logToFile(tempLogPath)

            testLogger.debug(debugMessage)
            testLogger.error(errorMessage)

            assert.ok(await isTextInLogFile(tempLogPath, errorMessage), 'Expected error message to be logged')
            assert.strictEqual(
                await isTextInLogFile(tempLogPath, debugMessage),
                false,
                'Unexpected debug message was logged'
            )
        })

        const happyLogScenarios = [
            {
                name: 'logs debug',
                logMessage: (logger: WinstonToolkitLogger, message: string) => {
                    logger.debug(message)
                }
            },
            {
                name: 'logs verbose',
                logMessage: (logger: WinstonToolkitLogger, message: string) => {
                    logger.verbose(message)
                }
            },
            {
                name: 'logs info',
                logMessage: (logger: WinstonToolkitLogger, message: string) => {
                    logger.info(message)
                }
            },
            {
                name: 'logs warn',
                logMessage: (logger: WinstonToolkitLogger, message: string) => {
                    logger.warn(message)
                }
            },
            {
                name: 'logs error',
                logMessage: (logger: WinstonToolkitLogger, message: string) => {
                    logger.error(message)
                }
            }
        ]

        happyLogScenarios.forEach(scenario => {
            it(scenario.name, async () => {
                const message = `message for ${scenario.name}`
                testLogger = new WinstonToolkitLogger('debug')
                testLogger.logToFile(tempLogPath)

                scenario.logMessage(testLogger, message)

                assert.ok(await isTextInLogFile(tempLogPath, message), 'Expected log message was missing')
            })
        })

        async function isTextInLogFile(logPath: string, text: string): Promise<boolean> {
            await waitForLogFile(logPath)
            const logText = await filesystemUtilities.readFileAsString(logPath)

            return logText.includes(text)
        }
    })

    // TODO : CC : tests for...
    // logs to an OutputChannel
    // does not log a lower level to an OutputChannel
    // logs multiple pieces

    // it('logs multiple pieces of info to a file', async () => {
    //     testLogger.info('logs', 'multiple', 'pieces', 'of', 'info', 'to', 'a', 'file')
    //     await waitForLogFile(tempLogPath)
    //     const logText = await filesystemUtilities.readFileAsString(tempLogPath)
    //     assert.strictEqual(logText.includes('[INFO]: logs multiple pieces of info to a file'), true)
    // })

    async function waitForLogFile(logPath: string): Promise<void> {
        const timeoutPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                clearTimeout(timeout)
                reject('Log file not found in 1500 ms')
            }, 1500)
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
