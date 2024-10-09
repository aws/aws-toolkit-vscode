/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import * as vscode from 'vscode'
import { ToolkitLogger } from '../../../shared/logger/toolkitLogger'
import { MockOutputChannel } from '../../mockOutputChannel'
import { sleep, waitUntil } from '../../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../../shared/errors'

/**
 * Disposes the logger then waits for the write streams to flush. The `expected` and `unexpected` arrays just look
 * for any occurence within the file, passing if all expected strings were found or failing if any unexpected strings
 * were found.
 *
 * TODO: merge this with `globalSetup.test.ts:assertLogsContain`
 */
async function checkFile(
    logger: ToolkitLogger,
    logPath: vscode.Uri,
    expected: string[],
    unexpected: string[] = []
): Promise<void> {
    const check = new Promise<void>(async (resolve, reject) => {
        // Timeout if we wait too long for file to exist
        setTimeout(() => reject(new Error('Timed out waiting for log message')), 10_000)

        // Wait for file to exist
        while (!fs.existsSync(logPath.fsPath)) {
            await sleep(200)
        }
        const contents = fs.readFileSync(logPath.fsPath)

        // Error if unexpected messages are in the log file
        const foundUnexpected = unexpected
            .filter((t) => contents.includes(t))
            .reduce((a, b) => a + `Unexpected message in log: ${b}\n`, '')
        if (foundUnexpected) {
            return reject(new Error(foundUnexpected))
        }

        // Fail if any of the expected messages are not in the log file
        const notFound = expected.filter((t) => !contents.includes(t))
        if (notFound.length > 0) {
            const last10Lines = contents.toString().split('\n').slice(-10)
            reject(
                new Error(
                    notFound.reduce((a, b) => a + `Expected message not found in log: ${b}\n`, '') +
                        `\n\n Last 10 log lines:\n${last10Lines.join('\n')}`
                )
            )
        }

        resolve()
    })

    return logger.dispose().then(() => check)
}

describe('ToolkitLogger', function () {
    let tempFolder: string

    before(async function () {
        tempFolder = await filesystemUtilities.makeTemporaryToolkitFolder()
    })

    after(async function () {
        await filesystemUtilities.tryRemoveFolder(tempFolder)
    })

    it('logLevelEnabled()', function () {
        const logger = new ToolkitLogger('info')
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
        assert.notStrictEqual(new ToolkitLogger('info'), undefined)
    })

    it('throws when logging to a disposed object', async function () {
        const logger = new ToolkitLogger('info')
        await logger.dispose()

        assert.throws(() => logger.info('This should not log'))
    })

    const happyLogScenarios = [
        {
            name: 'logs debug',
            logMessage: (logger: ToolkitLogger, msg: string, args: any[]) => {
                logger.debug(msg, ...args)
            },
        },
        {
            name: 'logs verbose',
            logMessage: (logger: ToolkitLogger, msg: string, args: any[]) => {
                logger.verbose(msg, ...args)
            },
        },
        {
            name: 'logs info',
            logMessage: (logger: ToolkitLogger, msg: string, args: any[]) => {
                logger.info(msg, ...args)
            },
        },
        {
            name: 'logs warn',
            logMessage: (logger: ToolkitLogger, msg: string, args: any[]) => {
                logger.warn(msg, ...args)
            },
        },
        {
            name: 'logs error',
            logMessage: (logger: ToolkitLogger, msg: string, args: any[]) => {
                logger.error(msg, ...args)
            },
        },
    ]

    describe('logs to a file', async function () {
        let tempLogPath: vscode.Uri
        let tempFileCounter = 0
        let testLogger: ToolkitLogger | undefined

        beforeEach(async function () {
            tempLogPath = vscode.Uri.joinPath(vscode.Uri.file(tempFolder), `temp-${++tempFileCounter}.log`)
        })

        it('does not log a lower level', async function () {
            const debugMessage = 'debug message'
            const errorMessage = 'error message'

            testLogger = new ToolkitLogger('error')
            testLogger.logToFile(tempLogPath)

            testLogger.debug(debugMessage)
            testLogger.error(errorMessage)

            await checkFile(testLogger, tempLogPath, [errorMessage], [debugMessage])
        })

        it('supports updating the log type', async function () {
            const nonLoggedVerboseEntry = 'verbose entry should not be logged'
            const loggedVerboseEntry = 'verbose entry should be logged'

            testLogger = new ToolkitLogger('info')
            testLogger.logToFile(tempLogPath)

            testLogger.verbose(nonLoggedVerboseEntry)
            testLogger.setLogLevel('verbose')
            testLogger.verbose(loggedVerboseEntry)

            await checkFile(testLogger, tempLogPath, [loggedVerboseEntry], [nonLoggedVerboseEntry])
        })

        happyLogScenarios.forEach((scenario) => {
            it(scenario.name, async () => {
                const msg = `message for ${scenario.name} arg1 %s, arg2 %O`
                const args = [42, ['a', 'b']]
                const expectedMsg = `message for ${scenario.name} arg1 42, arg2 [ 'a', 'b' ]`
                testLogger = new ToolkitLogger('debug')
                testLogger.logToFile(tempLogPath)

                scenario.logMessage(testLogger, msg, args)

                await checkFile(testLogger, tempLogPath, [expectedMsg])
            })
        })
    })

    describe('logs to an OutputChannel', async function () {
        let testLogger: ToolkitLogger | undefined
        let outputChannel: MockOutputChannel

        beforeEach(async function () {
            outputChannel = new MockOutputChannel()
        })

        afterEach(async function () {
            if (testLogger) {
                await testLogger.dispose()
                testLogger = undefined
            }
        })

        it('does not log a lower level', async function () {
            const debugMessage = 'debug message'
            const errorMessage = 'error message'

            testLogger = new ToolkitLogger('error')
            testLogger.logToOutputChannel(outputChannel, false)

            const waitForMessage = waitForLoggedTextByCount(1)

            testLogger.debug(debugMessage)
            testLogger.error(errorMessage)

            assert.ok((await waitForMessage).includes(errorMessage), 'Expected error message to be logged')
        })

        it('supports updating the log type', async function () {
            const nonLoggedVerboseEntry = 'verbose entry should not be logged'
            const loggedVerboseEntry = 'verbose entry should be logged'

            testLogger = new ToolkitLogger('info')
            testLogger.logToOutputChannel(outputChannel, false)

            testLogger.verbose(nonLoggedVerboseEntry)
            testLogger.setLogLevel('verbose')
            testLogger.verbose(loggedVerboseEntry)

            const waitForMessage = waitForLoggedTextByContents(loggedVerboseEntry)
            assert.ok((await waitForMessage).includes(loggedVerboseEntry), 'Expected error message to be logged')
            assert.ok(!(await waitForMessage).includes(nonLoggedVerboseEntry), 'unexpected message in log')
        })

        it('logs append topic header in message', async function () {
            const testMessage = 'This is a test message'
            const testMessageWithHeader = 'test: This is a test message'

            testLogger = new ToolkitLogger('info')
            testLogger.logToOutputChannel(outputChannel, false)
            testLogger.setTopic('test')
            testLogger.setLogLevel('verbose')
            testLogger.verbose(testMessage)

            const waitForMessage = waitForLoggedTextByContents(testMessageWithHeader)
            assert.ok((await waitForMessage).includes(testMessageWithHeader), 'Expected header added')
        })

        it('logs append topic header in errors', async function () {
            const testError = new ToolkitError('root error', { code: 'something went wrong' })
            const testErrorWithHeader = "topic: 'test'"

            testLogger = new ToolkitLogger('info')
            testLogger.logToOutputChannel(outputChannel, false)
            testLogger.setTopic('test')
            testLogger.setLogLevel('verbose')
            testLogger.verbose(testError)

            const waitForMessage = waitForLoggedTextByContents(testErrorWithHeader)
            assert.ok((await waitForMessage).includes(testErrorWithHeader), 'Expected header added')
        })

        it('unknown topic header ignored in message', async function () {
            const testMessage = 'This is a test message'
            const unknowntestMessage = 'unknown: This is a test message'

            testLogger = new ToolkitLogger('info')
            testLogger.logToOutputChannel(outputChannel, false)
            testLogger.setTopic('unknown')
            testLogger.setLogLevel('verbose')
            testLogger.verbose(testMessage)

            const waitForMessage = waitForLoggedTextByContents(testMessage)
            assert.ok((await waitForMessage).includes(testMessage), 'Expected message logged')
            assert.ok(!(await waitForMessage).includes(unknowntestMessage), 'unexpected header in log')
        })

        it('switch topic within same logger', async function () {
            const testMessage = 'This is a test message'
            const testMessageWithHeader = 'test: This is a test message'

            testLogger = new ToolkitLogger('info')
            testLogger.logToOutputChannel(outputChannel, false)
            testLogger.setTopic('unknown')
            testLogger.setTopic('test')
            testLogger.setLogLevel('verbose')
            testLogger.verbose(testMessage)

            const waitForMessage = waitForLoggedTextByContents(testMessageWithHeader)
            assert.ok((await waitForMessage).includes(testMessageWithHeader), 'Expected header added')
        })

        happyLogScenarios.forEach((scenario) => {
            it(scenario.name, async () => {
                const message = `message for ${scenario.name}`
                testLogger = new ToolkitLogger('debug')
                testLogger.logToOutputChannel(outputChannel, false)

                const waitForMessage = waitForLoggedTextByCount(1)

                scenario.logMessage(testLogger, message, [])

                assert.ok((await waitForMessage).includes(message), 'Expected error message to be logged')
            })
        })

        // Logger writes to OutputChannel in async manner.
        async function waitForLoggedTextByCount(entries: number): Promise<string> {
            return new Promise<string>((resolve, reject) => {
                let loggedEntries = 0
                let loggedText = ''

                const appendTextEvent = outputChannel.onDidAppendText((text) => {
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

                const appendTextEvent = outputChannel.onDidAppendText((text) => {
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
        let tempLogPath: vscode.Uri
        let tempFileCounter: number = 0
        let testLogger: ToolkitLogger

        beforeEach(async function () {
            testLogger = new ToolkitLogger('info')
            tempLogPath = vscode.Uri.joinPath(vscode.Uri.file(tempFolder), `temp-tracker-${tempFileCounter++}.log`)
            testLogger.logToFile(tempLogPath)
        })

        afterEach(async function () {
            await testLogger.dispose()
        })

        it('get info log message', async function () {
            const logID: number = testLogger.info('test')
            await checkFile(testLogger, tempLogPath, ['test'])
            assert.notStrictEqual(testLogger.getLogById(logID, tempLogPath), undefined)
        })

        it('debug log message is undefined', async function () {
            const logID: number = testLogger.debug('debug test')
            await checkFile(testLogger, tempLogPath, [], ['debug test'])
            assert.strictEqual(testLogger.getLogById(logID, tempLogPath), undefined)
        })

        it('retrieve multiple unique logs with other logs', async function () {
            const idMap = new Map<number, string>()
            const expected: string[] = []
            const unexpected: string[] = []

            for (let i = 0; i < 5; i++) {
                const logInfo = `log ${i}`
                const logError = `error log ${i}`
                const logDebug = `debug log ${i}`
                expected.push(logInfo, logError)
                unexpected.push(logDebug)
                testLogger.error(logError)
                testLogger.debug(logDebug)
                idMap.set(testLogger.info(logInfo), logInfo)
            }

            await checkFile(testLogger, tempLogPath, expected, unexpected)
            idMap.forEach((msg, id) => assert.ok(testLogger.getLogById(id, tempLogPath)?.includes(msg)))
        })

        it('can find log from multiple files', async function () {
            const logIDs: number[] = []
            const filePaths: vscode.Uri[] = []
            const expected: string[] = []

            // Make a bunch of files
            for (let i = 0; i < 4; i++) {
                tempLogPath = vscode.Uri.joinPath(vscode.Uri.file(tempFolder), `temp-tracker-${tempFileCounter++}.log`)
                testLogger.logToFile(tempLogPath)
                filePaths.push(tempLogPath)
            }

            for (let i = 0; i < 10; i++) {
                const errorLog = `error message ${i}`
                logIDs.push(testLogger.error(errorLog))
                expected.push(errorLog)
            }

            await Promise.all(filePaths.map((log) => checkFile(testLogger, log, expected)))

            const middleFile: vscode.Uri = filePaths[Math.floor(filePaths.length / 2)]
            const middleMsg = testLogger.getLogById(logIDs[Math.floor(logIDs.length / 2)], middleFile)
            assert.notStrictEqual(middleMsg, undefined)
        })

        it('can find log from channel', async function () {
            const outputChannel: MockOutputChannel = new MockOutputChannel()
            testLogger.logToOutputChannel(outputChannel, true)
            const logID: number = testLogger.error('Test error')

            const msg: string | undefined = await waitUntil(
                async () => testLogger.getLogById(logID, vscode.Uri.parse(`channel://${outputChannel.name}`)),
                { timeout: 2000, interval: 5, truthy: false }
            )

            assert.notStrictEqual(msg, undefined)
        })

        it('invalid log id raises exception', async function () {
            // Log ID counter will be at 3 after these
            testLogger.error('error log')
            testLogger.debug('debug log')

            assert.throws(
                () => testLogger.getLogById(-1, vscode.Uri.file('')),
                Error,
                'Invalid log state, logID=-1 must be in the range [0, 3)!'
            )

            assert.throws(
                () => testLogger.getLogById(3, vscode.Uri.file('')),
                Error,
                'Invalid log state, logID=3 must be in the range [0, 3)!'
            )
        })
    })
})
