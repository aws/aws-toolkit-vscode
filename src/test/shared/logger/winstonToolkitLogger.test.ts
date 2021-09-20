/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import * as vscode from 'vscode'
import { WinstonToolkitLogger } from '../../../shared/logger/winstonToolkitLogger'
import { MockOutputChannel } from '../../mockOutputChannel'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'

describe('WinstonToolkitLogger', function () {
    let tempFolder: string

    before(async function () {
        tempFolder = await filesystemUtilities.makeTemporaryToolkitFolder()
    })

    after(async function () {
        await filesystemUtilities.tryRemoveFolder(tempFolder)
    })

    it('logLevelEnabled()', function () {
        const logger = new WinstonToolkitLogger('info')
        // winston complains if we don't log to something
        logger.logToOutputChannel(new MockOutputChannel(), false)

        assert.strictEqual(true, logger.logLevelEnabled('error'))
        assert.strictEqual(true, logger.logLevelEnabled('warn'))
        assert.strictEqual(true, logger.logLevelEnabled('info'))
        assert.strictEqual(false, logger.logLevelEnabled('verbose'))
        assert.strictEqual(false, logger.logLevelEnabled('debug'))

        logger.setLogLevel('error')
        assert.strictEqual(true, logger.logLevelEnabled('error'))
        assert.strictEqual(false, logger.logLevelEnabled('warn'))
        assert.strictEqual(false, logger.logLevelEnabled('info'))
        assert.strictEqual(false, logger.logLevelEnabled('verbose'))
        assert.strictEqual(false, logger.logLevelEnabled('debug'))

        logger.setLogLevel('debug')
        assert.strictEqual(true, logger.logLevelEnabled('error'))
        assert.strictEqual(true, logger.logLevelEnabled('warn'))
        assert.strictEqual(true, logger.logLevelEnabled('info'))
        assert.strictEqual(true, logger.logLevelEnabled('verbose'))
        assert.strictEqual(true, logger.logLevelEnabled('debug'))
    })

    it('creates an object', function () {
        assert.notStrictEqual(new WinstonToolkitLogger('info'), undefined)
    })

    it('throws when logging to a disposed object', async function () {
        const logger = new WinstonToolkitLogger('info')
        logger.dispose()

        assert.throws(() => logger.info('This should not log'))
    })

    const happyLogScenarios = [
        {
            name: 'logs debug',
            logMessage: (logger: WinstonToolkitLogger, message: string) => {
                logger.debug(message)
            },
        },
        {
            name: 'logs verbose',
            logMessage: (logger: WinstonToolkitLogger, message: string) => {
                logger.verbose(message)
            },
        },
        {
            name: 'logs info',
            logMessage: (logger: WinstonToolkitLogger, message: string) => {
                logger.info(message)
            },
        },
        {
            name: 'logs warn',
            logMessage: (logger: WinstonToolkitLogger, message: string) => {
                logger.warn(message)
            },
        },
        {
            name: 'logs error',
            logMessage: (logger: WinstonToolkitLogger, message: string) => {
                logger.error(message)
            },
        },
    ]

    describe('logs to a file', async function () {
        let tempLogPath: string
        let tempFileCounter = 0
        let testLogger: WinstonToolkitLogger | undefined

        beforeEach(async function () {
            tempLogPath = path.join(tempFolder, `temp-${++tempFileCounter}.log`)
        })

        afterEach(async function () {
            if (testLogger) {
                testLogger.dispose()
                testLogger = undefined
            }
        })

        it('does not log a lower level', async function () {
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

        it('supports updating the log type', async function () {
            const nonLoggedVerboseEntry = 'verbose entry should not be logged'
            const loggedVerboseEntry = 'verbose entry should be logged'

            testLogger = new WinstonToolkitLogger('info')
            testLogger.logToFile(tempLogPath)

            testLogger.verbose(nonLoggedVerboseEntry)
            testLogger.setLogLevel('verbose')
            testLogger.verbose(loggedVerboseEntry)

            assert.ok(!(await isTextInLogFile(tempLogPath, nonLoggedVerboseEntry)), 'unexpected message in log')
            assert.ok(await isTextInLogFile(tempLogPath, loggedVerboseEntry), 'Expected error message to be logged')
        })

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
            return !!(await waitUntil(async () => logText.includes(text), {
                timeout: 5000,
                interval: 100,
                truthy: false,
            }))
        }

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

    describe('logs to an OutputChannel', async function () {
        let testLogger: WinstonToolkitLogger | undefined
        let outputChannel: MockOutputChannel

        beforeEach(async function () {
            outputChannel = new MockOutputChannel()
        })

        afterEach(async function () {
            if (testLogger) {
                testLogger.dispose()
                testLogger = undefined
            }
        })

        it('does not log a lower level', async function () {
            const debugMessage = 'debug message'
            const errorMessage = 'error message'

            testLogger = new WinstonToolkitLogger('error')
            testLogger.logToOutputChannel(outputChannel, false)

            const waitForMessage = waitForLoggedTextByCount(1)

            testLogger.debug(debugMessage)
            testLogger.error(errorMessage)

            assert.ok((await waitForMessage).includes(errorMessage), 'Expected error message to be logged')
        })

        it('supports updating the log type', async function () {
            const nonLoggedVerboseEntry = 'verbose entry should not be logged'
            const loggedVerboseEntry = 'verbose entry should be logged'

            testLogger = new WinstonToolkitLogger('info')
            testLogger.logToOutputChannel(outputChannel, false)

            testLogger.verbose(nonLoggedVerboseEntry)
            testLogger.setLogLevel('verbose')
            testLogger.verbose(loggedVerboseEntry)

            const waitForMessage = waitForLoggedTextByContents(loggedVerboseEntry)
            assert.ok((await waitForMessage).includes(loggedVerboseEntry), 'Expected error message to be logged')
            assert.ok(!(await waitForMessage).includes(nonLoggedVerboseEntry), 'unexpected message in log')
        })

        happyLogScenarios.forEach(scenario => {
            it(scenario.name, async () => {
                const message = `message for ${scenario.name}`
                testLogger = new WinstonToolkitLogger('debug')
                testLogger.logToOutputChannel(outputChannel, false)

                const waitForMessage = waitForLoggedTextByCount(1)

                scenario.logMessage(testLogger, message)

                assert.ok((await waitForMessage).includes(message), 'Expected error message to be logged')
            })
        })

        // Logger writes to OutputChannel in async manner.
        async function waitForLoggedTextByCount(entries: number): Promise<string> {
            return new Promise<string>((resolve, reject) => {
                let loggedEntries = 0
                let loggedText = ''

                const appendTextEvent = outputChannel.onDidAppendText(text => {
                    loggedText += text
                    loggedEntries++

                    if (loggedEntries >= entries) {
                        appendTextEvent.dispose()
                        resolve(loggedText)
                    }
                })
            })
        }

        // Logger writes to OutputChannel in async manner.
        async function waitForLoggedTextByContents(expectedText: string): Promise<string> {
            return new Promise<string>((resolve, reject) => {
                let loggedText = ''

                const appendTextEvent = outputChannel.onDidAppendText(text => {
                    loggedText += text

                    if (text.includes(expectedText)) {
                        appendTextEvent.dispose()
                        resolve(loggedText)
                    }
                })
            })
        }
    })

    // Log tracking functionality testing
    describe('log tracking', function () {
        let tempLogPath: string
        let tempFileCounter: number = 0
        let testLogger: WinstonToolkitLogger | undefined

        beforeEach(async function () {
            testLogger = new WinstonToolkitLogger('info')
            tempLogPath = path.join(tempFolder, `temp-tracker-${tempFileCounter++}.log`)
            testLogger.logToFile(tempLogPath)
            testLogger.error(new Error('Test start'))
            const logExists: boolean | undefined = await waitUntil(() => filesystemUtilities.fileExists(tempLogPath), {
                timeout: 2000,
                interval: 100,
                truthy: true,
            })

            if (!logExists) {
                throw new Error("Log file wasn't created during test")
            }
        })

        afterEach(function () {
            if (testLogger) {
                testLogger.dispose()
                testLogger = undefined
            }
        })

        it('get info log message', async function () {
            const logID: number = testLogger!.info('test')
            const msg: string | undefined = await waitUntil(
                async () => testLogger!.getLogById(logID, vscode.Uri.file(tempLogPath)),
                { timeout: 2000, interval: 10, truthy: false }
            )
            assert.notStrictEqual(msg, undefined)
        })

        it('debug log message is undefined', async function () {
            const logID: number = testLogger!.debug('debug test')
            const msg: string | undefined = await waitUntil(
                async () => testLogger!.getLogById(logID, vscode.Uri.file(tempLogPath)),
                { timeout: 50, interval: 5, truthy: false }
            )
            assert.strictEqual(msg, undefined)
        })

        it('retrieve multiple unique logs with other logs', async function () {
            const set: Set<string> = new Set<string>()

            for (let i = 0; i < 5; i++) {
                const logID: number = testLogger!.info(`log ${i}`)
                testLogger!.error('error log')
                testLogger!.debug('debug log')

                const msg: string | undefined = await waitUntil(
                    async () => testLogger!.getLogById(logID, vscode.Uri.file(tempLogPath)),
                    { timeout: 400, interval: 10, truthy: false }
                )
                assert.notStrictEqual(msg, undefined)
                assert.strictEqual(set.has(msg!), false)
                set.add(msg!)
            }
        })

        it('can find log within file', async function () {
            // Fill the file with messsages, then try to find the middle log
            const logIDs: number[] = []

            for (let i = 0; i < 10; i++) {
                logIDs.push(testLogger!.error(`error message ${i}`))
                testLogger!.warn('warning message')
            }

            const middleMsg: string | undefined = await waitUntil(
                async () => testLogger!.getLogById(logIDs[Math.floor(logIDs.length / 2)], vscode.Uri.file(tempLogPath)),
                { timeout: 2000, interval: 10, truthy: false }
            )

            assert.notStrictEqual(middleMsg, undefined)
        })

        it('can find log from multiple files', async function () {
            const logIDs: number[] = []
            const filePaths: string[] = []

            // Make a bunch of files
            for (let i = 0; i < 4; i++) {
                tempLogPath = path.join(tempFolder, `temp-tracker-${tempFileCounter++}.log`)
                testLogger!.logToFile(tempLogPath)
                filePaths.push(tempLogPath)
            }

            for (let i = 0; i < 10; i++) {
                logIDs.push(testLogger!.error(`error message ${i}`))
                testLogger!.warn('warning message')
            }

            const middleFile: string = filePaths[Math.floor(filePaths.length / 2)]
            const middleMsg: string | undefined = await waitUntil(
                async () => testLogger!.getLogById(logIDs[Math.floor(logIDs.length / 2)], vscode.Uri.file(middleFile)),
                { timeout: 2000, interval: 5, truthy: false }
            )

            assert.notStrictEqual(middleMsg, undefined)
        })

        it('can find log from channel', async function () {
            const outputChannel: MockOutputChannel = new MockOutputChannel()
            testLogger!.logToOutputChannel(outputChannel, true)
            const logID: number = testLogger!.error('Test error')

            const msg: string | undefined = await waitUntil(
                async () => testLogger!.getLogById(logID, vscode.Uri.parse(`channel://${outputChannel.name}`)),
                { timeout: 2000, interval: 5, truthy: false }
            )

            assert.notStrictEqual(msg, undefined)
        })

        it('invalid log id raises exception', async function () {
            // Log ID counter will be at 3 after these
            testLogger!.error('error log')
            testLogger!.debug('debug log')

            assert.throws(
                () => testLogger!.getLogById(-1, vscode.Uri.file('')),
                Error,
                'Invalid log state, logID=-1 must be in the range [0, 3)!'
            )

            assert.throws(
                () => testLogger!.getLogById(3, vscode.Uri.file('')),
                Error,
                'Invalid log state, logID=3 must be in the range [0, 3)!'
            )
        })
    })
})
