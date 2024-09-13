/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { stub, SinonStubbedInstance } from 'sinon'
import { TopicLogger, Logger, LogLevel } from '../../../shared/logger/logger'

describe('TopicLogger', () => {
    let mockCoreLogger: SinonStubbedInstance<Logger>
    let topicLogger: TopicLogger

    beforeEach(() => {
        mockCoreLogger = {
            debug: stub(),
            verbose: stub(),
            info: stub(),
            warn: stub(),
            error: stub(),
            setLogLevel: stub(),
            logLevelEnabled: stub(),
            getLogById: stub(),
            enableDebugConsole: stub(),
        } as SinonStubbedInstance<Logger>
        topicLogger = new TopicLogger(mockCoreLogger as Logger, 'Test')
    })

    it('adds topic prefix to string type messages', () => {
        topicLogger.info('Test message')
        assert(mockCoreLogger.info.calledWith('Test: Test message'))
    })

    it('adds topic prefix to Error type messages', () => {
        const testError = new Error('Test error')
        topicLogger.error(testError)
        assert(mockCoreLogger.error.calledOnce)
        const calledArg = mockCoreLogger.error.firstCall.args[0]
        assert(calledArg instanceof Error)
        assert.strictEqual(calledArg.message, 'Test: Test error')
        assert.strictEqual(calledArg.name, testError.name)
        assert.strictEqual(calledArg.stack, testError.stack)
    })

    it('topic is "Unknown" when not specified', () => {
        const defaultTopicLogger = new TopicLogger(mockCoreLogger as Logger)
        defaultTopicLogger.debug('Verbose message')
        assert(mockCoreLogger.debug.calledWith('Unknown: Verbose message'))
    })

    it('delegates setLogLevel to core logger', () => {
        topicLogger.setLogLevel('debug' as LogLevel)
        assert(mockCoreLogger.setLogLevel.calledWith('debug'))
    })

    it('delegates logLevelEnabled to core logger', () => {
        topicLogger.logLevelEnabled('info' as LogLevel)
        assert(mockCoreLogger.logLevelEnabled.calledWith('info'))
    })

    it('delegates getLogById to core logger', () => {
        const mockUri = {} as any
        topicLogger.getLogById(123, mockUri)
        assert(mockCoreLogger.getLogById.calledWith(123, mockUri))
    })

    it('delegates enableDebugConsole to core logger', () => {
        topicLogger.enableDebugConsole()
        assert(mockCoreLogger.enableDebugConsole.called)
    })
})
