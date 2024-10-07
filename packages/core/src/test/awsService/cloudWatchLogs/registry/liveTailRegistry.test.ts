/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import {
    LiveTailSession,
    LiveTailSessionConfiguration,
} from '../../../../awsService/cloudWatchLogs/registry/liveTailSession'
import {
    createLiveTailURIFromArgs,
    LiveTailSessionRegistry,
} from '../../../../awsService/cloudWatchLogs/registry/liveTailSessionRegistry'

describe('LiveTailRegistry', async function () {
    const session = new LiveTailSession({
        logGroupName: 'test-log-group',
        region: 'test-region',
    })

    let liveTailSessionRegistry: LiveTailSessionRegistry

    beforeEach(function () {
        liveTailSessionRegistry = new LiveTailSessionRegistry()
    })

    it('returns LiveTailSession after setting it', async function () {
        liveTailSessionRegistry.registerLiveTailSession(session)
        const retrievedSession = liveTailSessionRegistry.getLiveTailSessionFromUri(session.uri)
        assert.strictEqual(retrievedSession, session)
    })

    it('contains returns true after setting session', async function () {
        liveTailSessionRegistry.registerLiveTailSession(session)
        const doesContain = liveTailSessionRegistry.doesRegistryContainLiveTailSession(session.uri)
        assert.strictEqual(doesContain, true)
    })

    it('contains returns false if session not set', async function () {
        const doesContain = liveTailSessionRegistry.doesRegistryContainLiveTailSession(session.uri)
        assert.strictEqual(doesContain, false)
    })

    it('removeLiveTailSessionFromRegistry removes session from registry ', async function () {
        liveTailSessionRegistry.registerLiveTailSession(session)
        assert.strictEqual(liveTailSessionRegistry.doesRegistryContainLiveTailSession(session.uri), true)
        liveTailSessionRegistry.removeLiveTailSessionFromRegistry(session.uri)
        assert.strictEqual(liveTailSessionRegistry.doesRegistryContainLiveTailSession(session.uri), false)
    })

    it('throws registering the same session twice', async function () {
        liveTailSessionRegistry.registerLiveTailSession(session)
        assert.throws(() => liveTailSessionRegistry.registerLiveTailSession(session))
    })

    it('throws cant find session', async function () {
        assert.throws(() => liveTailSessionRegistry.getLiveTailSessionFromUri(session.uri))
    })
})

describe('LiveTailSession URI', async function () {
    it('is correct with no logStream filter, no filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: 'test-log-group',
            region: 'test-region',
        }
        const expectedUri = vscode.Uri.parse('aws-cwl-lt:test-region:test-log-group')
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with no logStream filter, with filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: 'test-log-group',
            region: 'test-region',
            logEventFilterPattern: 'test-filter',
        }
        const expectedUri = vscode.Uri.parse('aws-cwl-lt:test-region:test-log-group:test-filter')
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with ALL logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: 'test-log-group',
            region: 'test-region',
            logStreamFilter: {
                type: 'all',
            },
        }
        const expectedUri = vscode.Uri.parse('aws-cwl-lt:test-region:test-log-group:all')
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with prefix logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: 'test-log-group',
            region: 'test-region',
            logStreamFilter: {
                type: 'prefix',
                filter: 'test-prefix',
            },
        }
        const expectedUri = vscode.Uri.parse('aws-cwl-lt:test-region:test-log-group:prefix:test-prefix')
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with specific logStream filter', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: 'test-log-group',
            region: 'test-region',
            logStreamFilter: {
                type: 'specific',
                filter: 'test-stream',
            },
        }
        const expectedUri = vscode.Uri.parse('aws-cwl-lt:test-region:test-log-group:specific:test-stream')
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })

    it('is correct with specific logStream filter and filter pattern', function () {
        const config: LiveTailSessionConfiguration = {
            logGroupName: 'test-log-group',
            region: 'test-region',
            logStreamFilter: {
                type: 'specific',
                filter: 'test-stream',
            },
            logEventFilterPattern: 'test-filter',
        }
        const expectedUri = vscode.Uri.parse('aws-cwl-lt:test-region:test-log-group:specific:test-stream:test-filter')
        const uri = createLiveTailURIFromArgs(config)
        assert.deepEqual(uri, expectedUri)
    })
})
