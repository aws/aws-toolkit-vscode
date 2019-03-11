/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import { BasicLogger, ErrorOrString, LogLevel } from '../../../shared/logger'
import { getChannelLogger, localize, processTemplate, TemplateParams } from '../../../shared/utilities/vsCodeUtils'
import { MockOutputChannel } from '../../mockOutputChannel'

class MockLogger implements BasicLogger {

    public logs = {
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
    public static format(messages: ErrorOrString[]) {
        return JSON.stringify(messages.map(msg => msg instanceof Error ? msg.message : msg))
    }
}

interface IndexableLogger {
    [logLevel: string]: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) => void
}

describe('vsCodeUtils getChannelLogger', async () => {

    let logger: MockLogger
    let outputChannel: MockOutputChannel

    beforeEach(async () => {
        logger = new MockLogger()
        outputChannel = new MockOutputChannel()
    })

    const testWith = ({
        title, nlsKey, nlsTemplate, templateTokens = []
    }: TemplateParams & { title: string }) => {
        describe(title, function() {
            const logLevels: LogLevel[] = ['verbose', 'debug', 'info', 'warn', 'error']
            logLevels.forEach( level => {
                it(`with ${level} `, function() {
                    const expectedPrettyTokens: Exclude<ErrorOrString, Error>[] = []
                    const expectedErrorTokens: Error[] = []
                    templateTokens.forEach(token => {
                         if (token instanceof Error) {
                            expectedPrettyTokens.push(token.message)
                            expectedErrorTokens.push(token)
                         } else {
                            expectedPrettyTokens.push(token)
                         }
                     })
                    const expectedPrettyMsg = localize(nlsKey, nlsTemplate, ...expectedPrettyTokens)
                    const expectedLogMsg = MockLogger.format([expectedPrettyMsg, ...expectedErrorTokens])
                    console.debug('\t\texpected pretty msg:', expectedPrettyMsg)
                    try {
                        // Use channelLogger to log it
                        const channelLogger: IndexableLogger = getChannelLogger(outputChannel, logger)
                        channelLogger[level](nlsKey, nlsTemplate, ...templateTokens)
                        // Test logger write
                        assert(
                            logger.logs[level].has(expectedLogMsg),
                            `logger missing msg: ${expectedLogMsg} in ${JSON.stringify(Array.from(logger.logs[level]))}`
                        )
                        // Test channel write
                        assert(
                            outputChannel.value.indexOf(expectedPrettyMsg) >= 0,
                            `channel missing msg: ${expectedPrettyMsg} in ${outputChannel.value}`
                        )

                        // Test processTemplate
                        const {
                            prettyMessage: actualPrettyMsg,
                            errors: actualErrorTokens
                        } = processTemplate({
                            nlsKey,
                            nlsTemplate,
                            templateTokens
                        })
                        assert(
                            expectedPrettyMsg === actualPrettyMsg,
                            `expected pretty msg to be ${expectedPrettyMsg}, found ${actualPrettyMsg}`
                        )
                        assert.deepStrictEqual(
                            expectedErrorTokens,
                            actualErrorTokens,
                            `expected error tokens to be ${expectedErrorTokens}, found ${actualErrorTokens}`
                        )
                    } catch (error) {
                        assert.fail(`Error testing ${level} level: ${String(error)}`)
                    }
                })
            })
        })
    }

    const testData = [
        {
            title: 'logs w/o template params',
            nlsKey: 'silly.key1',
            nlsTemplate: 'Yay',
            templateTokens: undefined,
        },
        {
            title: 'logs with 1 string template param',
            nlsKey: 'silly.key2',
            nlsTemplate: 'Nice to meet you "{0}"',
            templateTokens: ['bob'],
        },
        {
            title: 'logs with 2 string template params',
            nlsKey: 'silly.key3',
            nlsTemplate: 'Hey "{0}", meet "{1}"',
            templateTokens: ['bob', 'joe'],
        },
        {
            title: 'logs with 3 string template params',
            nlsKey: 'silly.key4',
            nlsTemplate: 'Hey "{0}", meet "{1}" and "{2}"',
            templateTokens: ['bob', 'joe', 'kim'],
        },
        {
            title: 'logs with 2 template params: errro, string',
            nlsKey: 'silly.key5',
            nlsTemplate: 'Oh no "{1}", we found an error: "{0}"',
            templateTokens: [new Error('Stock market crash'), 'joe'],
        },
        {
            title: 'logs with 2 template params: error, error',
            nlsKey: 'silly.key6',
            nlsTemplate: '1st Error "{0}"; 2nd error: "{1}"',
            templateTokens: [new Error('Error zero'), new Error('Error one')],
        },
        {
            title: 'logs with 3 template params: string, error, error',
            nlsKey: 'silly.key7',
            nlsTemplate: 'Oh my "{0}", there are errors: 1st Error "{1}"; 2nd error: "{2}"',
            templateTokens: ['Bob', new Error('Error zero'), new Error('Error one')],
        },
    ]

    testData.forEach(testWith)

})
