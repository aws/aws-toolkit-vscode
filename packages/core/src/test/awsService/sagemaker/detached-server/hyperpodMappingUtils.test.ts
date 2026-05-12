/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import * as hyperpodMappingUtils from '../../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'

describe('hyperpodMappingUtils', () => {
    let readStub: sinon.SinonStub
    let writeStub: sinon.SinonStub

    beforeEach(() => {
        readStub = sinon.stub(hyperpodMappingUtils, 'readHyperpodMapping')
        writeStub = sinon.stub(hyperpodMappingUtils, 'writeHyperpodMapping').resolves()
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('createConnectionKey', () => {
        it('creates key from workspace, namespace, and cluster', () => {
            const key = hyperpodMappingUtils.createConnectionKey('myspace', 'default', 'mycluster')
            assert.strictEqual(key, 'myspace:default:mycluster')
        })

        it('throws if any parameter contains a colon', () => {
            assert.throws(() => hyperpodMappingUtils.createConnectionKey('my:space', 'default', 'cluster'))
            assert.throws(() => hyperpodMappingUtils.createConnectionKey('space', 'de:fault', 'cluster'))
            assert.throws(() => hyperpodMappingUtils.createConnectionKey('space', 'default', 'cl:uster'))
        })
    })

    const freshMapping = {
        deepLink: {
            'ws:ns:cluster': {
                requests: {
                    'initial-connection': {
                        sessionId: 'sess-1',
                        url: 'wss://example.com',
                        token: 'tok-1',
                        status: 'fresh' as const,
                    },
                },
            },
        },
    }

    describe('getHyperpodFreshEntry', () => {
        it('returns fresh entry and marks consumed', async () => {
            readStub.resolves(freshMapping)

            const entry = await hyperpodMappingUtils.getHyperpodFreshEntry('ws:ns:cluster')
            assert.strictEqual(entry?.sessionId, 'sess-1')
            assert.strictEqual(entry?.url, 'wss://example.com')
            assert.strictEqual(entry?.token, 'tok-1')
            assert(writeStub.calledOnce)
        })

        it('checks initial-connection first regardless of requestId', async () => {
            readStub.resolves(freshMapping)

            const entry = await hyperpodMappingUtils.getHyperpodFreshEntry('ws:ns:cluster', '1234567890')
            assert.strictEqual(entry?.sessionId, 'sess-1')
        })

        it('returns undefined when no deepLink section exists', async () => {
            readStub.resolves({})
            const entry = await hyperpodMappingUtils.getHyperpodFreshEntry('ws:ns:cluster')
            assert.strictEqual(entry, undefined)
        })

        it('returns undefined when entry is consumed', async () => {
            readStub.resolves({
                deepLink: {
                    'ws:ns:cluster': {
                        requests: {
                            'initial-connection': {
                                sessionId: 'sess-1',
                                url: 'wss://example.com',
                                token: 'tok-1',
                                status: 'consumed',
                            },
                        },
                    },
                },
            })

            const entry = await hyperpodMappingUtils.getHyperpodFreshEntry('ws:ns:cluster')
            assert.strictEqual(entry, undefined)
        })
    })

    describe('markHyperpodConsumed', () => {
        it('sets status to consumed and writes', async () => {
            const mapping = {
                deepLink: {
                    'ws:ns:cluster': {
                        requests: {
                            'initial-connection': {
                                sessionId: 'sess-1',
                                url: 'wss://example.com',
                                token: 'tok-1',
                                status: 'fresh' as const,
                            },
                        },
                    },
                },
            }
            readStub.resolves(mapping)

            await hyperpodMappingUtils.markHyperpodConsumed('ws:ns:cluster', 'initial-connection')

            assert(writeStub.calledOnce)
            const written = writeStub.firstCall.args[0]
            assert.strictEqual(written.deepLink['ws:ns:cluster'].requests['initial-connection'].status, 'consumed')
        })

        it('does nothing when entry does not exist', async () => {
            readStub.resolves({ deepLink: {} })
            await hyperpodMappingUtils.markHyperpodConsumed('ws:ns:cluster')
            assert(writeStub.notCalled)
        })
    })

    describe('getHyperpodRequestStatus', () => {
        it('returns fresh when entry is fresh', async () => {
            readStub.resolves({
                deepLink: {
                    'ws:ns:cluster': {
                        requests: {
                            'initial-connection': { sessionId: '', url: '', token: '', status: 'fresh' },
                        },
                    },
                },
            })

            const status = await hyperpodMappingUtils.getHyperpodRequestStatus('ws:ns:cluster')
            assert.strictEqual(status, 'fresh')
        })

        it('returns not-started when no entry exists', async () => {
            readStub.resolves({})
            const status = await hyperpodMappingUtils.getHyperpodRequestStatus('ws:ns:cluster')
            assert.strictEqual(status, 'not-started')
        })
    })
})
