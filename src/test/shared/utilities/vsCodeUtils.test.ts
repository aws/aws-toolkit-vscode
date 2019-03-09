/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { ErrorOrString, initialize, Logger, LogLevel } from '../../../shared/logger'
import { getChannelLogger } from '../../../shared/utilities/vsCodeUtils'

import { MockOutputChannel } from '../../mockOutputChannel'

const localize: nls.LocalizeFunc = nls.loadMessageBundle()
initialize() // :(

class MockLogger implements Logger {
    public logs = {
        verbose: new Set<string>(),
        debug: new Set<string>(),
        info: new Set<string>(),
        warn: new Set<string>(),
        error: new Set<string>(),
    }
    public level: LogLevel = 'debug'
    public logPath: string = '/tmp/logs'
    public outputChannel?: vscode.OutputChannel

    public releaseLogger() {
        // do nothing
    }
    public verbose(...messages: ErrorOrString[]) {
        this.logs.verbose.add(String(messages[0])) // localize always returns a single string
    }
    public debug(...messages: ErrorOrString[]) {
        this.logs.debug.add(String(messages[0]))
    }
    public info(...messages: ErrorOrString[]) {
        this.logs.info.add(String(messages[0]))
    }
    public warn(...messages: ErrorOrString[]) {
        this.logs.warn.add(String(messages[0]))
    }
    public error(...messages: ErrorOrString[]) {
        this.logs.error.add(String(messages[0]))
    }
}

describe('vsCodeUtils', async () => {

    let logger: MockLogger
    let outputChannel: MockOutputChannel

// before(async () => {
    // })

    beforeEach(async () => {
        logger = new MockLogger()
        outputChannel = new MockOutputChannel()
    })

    const testWith = ({title, nlsKey, nslTemplate, templateTokens = []}: {
        title: string,
        nlsKey: string,
        nslTemplate: string,
        templateTokens?: ErrorOrString[],
    }) => {
        describe(title, function() {
            const logLevels: LogLevel[] = ['verbose', 'debug', 'info', 'warn', 'error']
            logLevels.forEach( level => {
                it(`with ${level} `, function() {
                    const channelLogger = getChannelLogger(outputChannel, logger) as any
                    const prettyTokens = templateTokens.map(token =>  token instanceof Error ? token.message : token)
                    const expectedMsg = localize(nlsKey, nslTemplate, ...prettyTokens)
                    console.debug('\t\texpected msg:', expectedMsg)
                    try {
                        channelLogger[level](nlsKey, nslTemplate, ...templateTokens) // Log it
                        assert(
                            logger.logs[level].has(expectedMsg),
                            `logger missing msg: ${expectedMsg} in ${JSON.stringify(Array.from(logger.logs[level]))}`
                        )
                        assert(
                            outputChannel.value.indexOf(expectedMsg) >= 0,
                            `channel missing msg: ${expectedMsg} in ${outputChannel.value}`
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
            title: 'logs message properly w/o template params',
            nlsKey: 'silly.key1',
            nslTemplate: 'Yay',
            templateTokens: undefined,
        },
        {
            title: 'logs message properly w/o template 1 string template params',
            nlsKey: 'silly.key2',
            nslTemplate: 'Nice to meet you "{0}"',
            templateTokens: ['bob'],
        },
        {
            title: 'logs message properly w/o template 2 string template params',
            nlsKey: 'silly.key3',
            nslTemplate: 'Hey "{0}", meet "{1}"',
            templateTokens: ['bob', 'joe'],
        },
        {
            title: 'logs message properly with 2 template params: errro, string',
            nlsKey: 'silly.key4',
            nslTemplate: 'Oh no "{1}", we found an error: "{0}"',
            templateTokens: [new Error('Stock market crash'), 'joe'],
        },
        {
            title: 'logs message properly w/o template 2 Error template params',
            nlsKey: 'silly.key3',
            nslTemplate: '1st Error "{0}"; 2nd error: "{1}"',
            templateTokens: [new Error('Error zero'), new Error('Error one')],
        },
    ]

    testData.forEach(testWith)

})
