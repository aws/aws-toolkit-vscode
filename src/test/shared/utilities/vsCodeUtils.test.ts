/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { BasicLogger, ErrorOrString, initialize, LogLevel } from '../../../shared/logger'
import {
    ChannelLogger,
    getChannelLogger,
    localize,
    processTemplate,
    TemplateHandler,
    TemplateParams,
} from '../../../shared/utilities/vsCodeUtils'
import { MockOutputChannel } from '../../mockOutputChannel'

class MockLogger implements BasicLogger {

    public logs: { [level: string]: Set<string> } = {
        verbose: new Set<string>(),
        debug: new Set<string>(),
        info: new Set<string>(),
        warn: new Set<string>(),
        error: new Set<string>(),
    }
    public outputChannel?: vscode.OutputChannel
    public verbose(...messages: ErrorOrString[]) {
        this.logs.verbose.add(MockLogger.format(messages))
    }
    public debug(...messages: ErrorOrString[]) {
        this.logs.debug.add(MockLogger.format(messages))
    }
    public info(...messages: ErrorOrString[]) {
        this.logs.info.add(MockLogger.format(messages))
    }
    public warn(...messages: ErrorOrString[]) {
        this.logs.warn.add(MockLogger.format(messages))
    }
    public error(...messages: ErrorOrString[]) {
        this.logs.error.add(MockLogger.format(messages))
    }
    public static format(messages: ErrorOrString[]): string {
        return JSON.stringify(messages.map(msg => msg instanceof Error ? msg.message : msg))
    }
}

interface TestCaseParams {
    logLevel: string,
    testDataCase: TestData,
    expectedPrettyMsg: string,
    expectedPrettyTokens: string[],
    expectedErrorTokens: Error[]
}

interface TestRunner {
    (params: TestCaseParams): Promise<void>
}

const logLevels: LogLevel[] = ['verbose', 'debug', 'info', 'warn', 'error']

interface TestData extends TemplateParams {
    title: string
}

const testData: TestData[] = [
    {
        title: 'logs w/o template params',
        nlsKey: 'silly.key1',
        nlsTemplate: 'Yay',
        templateTokens: undefined,
    },
    {
        title: 'logs with 1 string template param',
        nlsKey: 'silly.key2',
        nlsTemplate: "Nice to meet you '{0}'",
        templateTokens: ['bob'],
    },
    {
        title: 'logs with 2 string template params',
        nlsKey: 'silly.key3',
        nlsTemplate: "Hey '{0}', meet '{1}'",
        templateTokens: ['bob', 'joe'],
    },
    {
        title: 'logs with 3 string template params',
        nlsKey: 'silly.key4',
        nlsTemplate: "Hey '{0}', meet '{1}' and '{2}",
        templateTokens: ['bob', 'joe', 'kim'],
    },
    {
        title: 'logs with 2 template params: errro, string',
        nlsKey: 'silly.key5',
        nlsTemplate: "Oh no '{1}', we found an error: '{0}'",
        templateTokens: [new Error('Stock market crash'), 'joe'],
    },
    {
        title: 'logs with 2 template params: error, error',
        nlsKey: 'silly.key6',
        nlsTemplate: "1st Error '{0}'; 2nd error: '{1}'",
        templateTokens: [new Error('Error zero'), new Error('Error one')],
    },
    {
        title: 'logs with 3 template params: string, error, error',
        nlsKey: 'silly.key7',
        nlsTemplate: "Oh my '{0}', there are errors: 1st Error '{1}'; 2nd error: '{2}'",
        templateTokens: ['Bob', new Error('Error zero'), new Error('Error one')],
    },
]

describe('vsCodeUtils getChannelLogger', function () {

    let logger: MockLogger
    let outputChannel: MockOutputChannel
    let channelLogger: ChannelLogger

    before(async () => {
        await initialize()
    })

    const runEachTestCase = async (onRunTest: TestRunner) => {
        for (const logLevel of logLevels) {
            for (const testDataCase of testData) {
                // Reset loggers for each test case
                logger = new MockLogger()
                outputChannel = new MockOutputChannel()
                channelLogger = getChannelLogger(outputChannel, logger)
                console.debug(`         input ${JSON.stringify({ logLevel, ...testDataCase })}`)
                const expectedPrettyTokens: Exclude<ErrorOrString, Error>[] = []
                const expectedErrorTokens: Error[] = []
                if (testDataCase.templateTokens) {
                    testDataCase.templateTokens.forEach(token => {
                        if (token instanceof Error) {
                            expectedPrettyTokens.push(token.message)
                            expectedErrorTokens.push(token)
                        } else {
                            expectedPrettyTokens.push(token)
                        }
                    })
                }
                const expectedPrettyMsg = localize(
                    testDataCase.nlsKey,
                    testDataCase.nlsTemplate,
                    ...expectedPrettyTokens
                )

                await onRunTest({
                    logLevel,
                    testDataCase,
                    expectedPrettyMsg,
                    expectedPrettyTokens,
                    expectedErrorTokens
                })
            }
        }
    }

    const assertCommonLoggerWorks: TestRunner = async ({
        logLevel,
        expectedPrettyMsg,
        expectedErrorTokens,
        testDataCase
    }: TestCaseParams) => {
        // Log message to channel
        (channelLogger as unknown as { [logLevel: string]: TemplateHandler })[logLevel](
            testDataCase.nlsKey,
            testDataCase.nlsTemplate,
            ...(testDataCase.templateTokens || [])
        )
        const expectedLogMsg = MockLogger.format([expectedPrettyMsg, ...expectedErrorTokens])
        assert(
            logger.logs[logLevel].has(expectedLogMsg),
            `
            expectedLogMsg:
                ${expectedLogMsg}
            error.logs:
                ${JSON.stringify(Array.from(logger.logs[logLevel]))}
            input:
                ${JSON.stringify({ ...testDataCase, expectedPrettyMsg, expectedErrorTokens }, undefined, 2)}`
        )
    }

    const assertChannelLoggerWorks: TestRunner = async ({
        expectedPrettyMsg,
        expectedPrettyTokens,
        logLevel, testDataCase
    }: TestCaseParams) => {
        // Log message to channel
        (channelLogger as unknown as { [logLevel: string]: TemplateHandler })[logLevel](
            testDataCase.nlsKey,
            testDataCase.nlsTemplate,
            ...(testDataCase.templateTokens || [])
        )

        assert(
            outputChannel.value.indexOf(expectedPrettyMsg) >= 0,
            `channel missing msg: ${expectedPrettyMsg} in ${outputChannel.value}` +
            ` input: ${JSON.stringify({ ...testDataCase, expectedPrettyTokens })}`
        )
    }

    const assertProcessTemplateWorks: TestRunner = async ({
        testDataCase,
        expectedPrettyMsg,
        expectedErrorTokens
    }: TestCaseParams) => {
        const {
            prettyMessage: actualPrettyMsg,
            errors: actualErrorTokens
        } = processTemplate(testDataCase)

        assert(
            expectedPrettyMsg === actualPrettyMsg,
            `expected pretty msg to be ${expectedPrettyMsg}, found ${actualPrettyMsg}` +
            ` input: ${JSON.stringify({ ...testDataCase })}`
        )
        assert.deepStrictEqual(
            expectedErrorTokens,
            actualErrorTokens,
            `expected error tokens to be ${expectedErrorTokens}, found ${actualErrorTokens}` +
            ` input: ${JSON.stringify({ ...testDataCase })}`
        )
    }

    it('should log to common logger', async () => {
        await runEachTestCase(assertCommonLoggerWorks)
    })

    it('should log to channel logger', async () => {
        await runEachTestCase(assertChannelLoggerWorks)
    })

    it('should processTemplate', async () => {
        await runEachTestCase(assertProcessTemplateWorks)
    })

    it('should expose output channel', async () => {
        assert(
            channelLogger.channel === outputChannel,
            'channelLogger.channel !== outputChannel'
        )
    })

    it('should expose logger', async () => {
        assert(
            channelLogger.logger === logger,
            'channelLogger.logger !== logger'
        )
    })

})
