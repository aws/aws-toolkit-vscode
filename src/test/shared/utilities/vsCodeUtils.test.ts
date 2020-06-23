/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Loggable, LogLevel } from '../../../shared/logger'
import { isError } from 'lodash'
import {
    ChannelLogger,
    getChannelLogger,
    localize,
    processTemplate,
    TemplateHandler,
    TemplateParams,
} from '../../../shared/utilities/vsCodeUtils'
import { getTestLogger } from '../../globalSetup.test'
import { MockOutputChannel } from '../../mockOutputChannel'
import { TestLogger } from '../../testLogger'

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

describe('getChannelLogger', function() {
    let logger: TestLogger
    let outputChannel: MockOutputChannel
    let channelLogger: ChannelLogger

    beforeEach(async () => {
        logger = getTestLogger()
        outputChannel = new MockOutputChannel()
        channelLogger = getChannelLogger(outputChannel)
    })

    for (const logLevel of logLevels) {
        describe(`log level ${logLevel}`, async () => {
            for (const scenario of testData) {
                describe(scenario.title, async () => {
                    const expectedPrettyTokens = getFormattedLoggables(scenario.templateTokens)
                    const expectedErrorTokens: Error[] = getErrorLoggables(scenario.templateTokens)
                    const expectedPrettyMsg = localize(scenario.nlsKey, scenario.nlsTemplate, ...expectedPrettyTokens)

                    beforeEach(async () => {
                        // Log message to channel (eg: calls channelLogger.info(...))
                        ;((channelLogger as unknown) as { [logLevel: string]: TemplateHandler })[logLevel](
                            scenario.nlsKey,
                            scenario.nlsTemplate,
                            ...(scenario.templateTokens || [])
                        )
                    })

                    it('writes to the logger', async () => {
                        const actualLogEntries = logger.getLoggedEntries(logLevel)
                        const loggedErrors = actualLogEntries.filter(isError)
                        const loggedText = actualLogEntries.filter(x => !isError(x))

                        assert.strictEqual(loggedText.length, 1, 'Expected to log only one string')
                        assert.strictEqual(
                            loggedErrors.length,
                            expectedErrorTokens.length,
                            'Unexpected amount of Error objects logged'
                        )
                        assert.strictEqual(loggedText[0], expectedPrettyMsg, 'Unexpected formatted message')
                    })

                    it('writes to the output channel', async () => {
                        assert(
                            outputChannel.value.includes(expectedPrettyMsg),
                            `channel missing msg: ${expectedPrettyMsg} in ${outputChannel.value}` +
                                ` input: ${JSON.stringify({ ...scenario, expectedPrettyTokens })}`
                        )
                    })

                    it('processTemplate handles this scenario', async () => {
                        const { prettyMessage: actualPrettyMsg, errors: actualErrorTokens } = processTemplate(scenario)

                        assert.strictEqual(
                            expectedPrettyMsg,
                            actualPrettyMsg,
                            `input: ${JSON.stringify({ ...scenario })}`
                        )
                        assert.deepStrictEqual(
                            expectedErrorTokens,
                            actualErrorTokens,
                            `expected error tokens to be ${expectedErrorTokens}, found ${actualErrorTokens}` +
                                ` input: ${JSON.stringify({ ...scenario })}`
                        )
                    })
                })
            }
        })
    }

    it('should expose output channel', async () => {
        assert(channelLogger.channel === outputChannel, 'channelLogger.channel !== outputChannel')
    })
})

function getErrorLoggables(loggables?: Loggable[]): Error[] {
    return loggables?.filter(x => x instanceof Error).map(x => x as Error) ?? []
}

function getFormattedLoggables(loggables?: Loggable[]): Exclude<Loggable, Error>[] {
    return (
        loggables?.map(loggable => {
            if (loggable instanceof Error) {
                return loggable.message
            } else {
                return loggable
            }
        }) ?? []
    )
}
