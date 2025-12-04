/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import * as utils from '../../../../awsService/sagemaker/detached-server/utils'
import { SessionStore } from '../../../../awsService/sagemaker/detached-server/sessionStore'
import { SsmConnectionInfo } from '../../../../awsService/sagemaker/types'

describe('SessionStore', () => {
    let readMappingStub: sinon.SinonStub
    let writeMappingStub: sinon.SinonStub
    const connectionId = 'abc'
    const requestId = 'req123'

    const baseMapping = {
        deepLink: {
            [connectionId]: {
                refreshUrl: 'https://refresh.url',
                requests: {
                    [requestId]: { sessionId: 's1', token: 't1', url: 'u1', status: 'fresh' },
                    'initial-connection': { sessionId: 's0', token: 't0', url: 'u0', status: 'fresh' },
                },
            },
        },
    }

    beforeEach(() => {
        readMappingStub = sinon.stub(utils, 'readMapping').returns(JSON.parse(JSON.stringify(baseMapping)))
        writeMappingStub = sinon.stub(utils, 'writeMapping')
    })

    afterEach(() => sinon.restore())

    it('gets refreshUrl', async () => {
        const store = new SessionStore()
        const result = await store.getRefreshUrl(connectionId)
        assert.strictEqual(result, 'https://refresh.url')
    })

    it('returns undefined for SMUS connections (no refreshUrl)', async () => {
        const store = new SessionStore()
        readMappingStub.returns({
            deepLink: {
                [connectionId]: {
                    refreshUrl: undefined,
                    requests: {
                        'initial-connection': { sessionId: 's0', token: 't0', url: 'u0', status: 'fresh' },
                    },
                },
            },
        })
        const result = await store.getRefreshUrl(connectionId)
        assert.strictEqual(result, undefined)
    })

    it('returns valid URL for SageMaker AI connections (existing behavior)', async () => {
        const store = new SessionStore()
        const result = await store.getRefreshUrl(connectionId)
        assert.strictEqual(result, 'https://refresh.url')
    })

    it('throws if no mapping exists for connectionId', async () => {
        const store = new SessionStore()
        readMappingStub.returns({ deepLink: {} })

        await assert.rejects(() => store.getRefreshUrl('missing'), /No mapping found/)
    })

    it('throws if no deepLink mapping exists', async () => {
        const store = new SessionStore()
        readMappingStub.returns({})

        await assert.rejects(() => store.getRefreshUrl(connectionId), /No deepLink mapping found/)
    })

    it('returns fresh entry and marks consumed', async () => {
        const store = new SessionStore()
        const result = await store.getFreshEntry(connectionId, requestId)
        assert.deepStrictEqual(result, {
            sessionId: 's0',
            token: 't0',
            url: 'u0',
            status: 'consumed',
        })
        assert(writeMappingStub.calledOnce)
    })

    it('returns async fresh entry and deletes it', async () => {
        const store = new SessionStore()
        // Disable initial-connection freshness
        readMappingStub.returns({
            deepLink: {
                [connectionId]: {
                    refreshUrl: 'url',
                    requests: {
                        'initial-connection': { status: 'consumed' },
                        [requestId]: { sessionId: 'a', token: 'b', url: 'c', status: 'fresh' },
                    },
                },
            },
        })
        const result = await store.getFreshEntry(connectionId, requestId)
        assert.ok(result, 'Expected result to be defined')
        assert.strictEqual(result.sessionId, 'a')
        assert(writeMappingStub.calledOnce)

        // Verify the entry was deleted from the mapping
        const updated = writeMappingStub.firstCall.args[0]
        assert.strictEqual(updated.deepLink[connectionId].requests[requestId], undefined)
    })

    it('returns undefined if no fresh entries exist', async () => {
        const store = new SessionStore()
        readMappingStub.returns({
            deepLink: {
                [connectionId]: {
                    refreshUrl: 'url',
                    requests: {
                        'initial-connection': { status: 'consumed' },
                        [requestId]: { status: 'pending' },
                    },
                },
            },
        })
        const result = await store.getFreshEntry(connectionId, requestId)
        assert.strictEqual(result, undefined)
    })

    it('gets status of known entry', async () => {
        const store = new SessionStore()
        const result = await store.getStatus(connectionId, requestId)
        assert.strictEqual(result, 'fresh')
    })

    it('returns not-started if request not found', async () => {
        const store = new SessionStore()
        const result = await store.getStatus(connectionId, 'unknown')
        assert.strictEqual(result, 'not-started')
    })

    it('marks entry as consumed', async () => {
        const store = new SessionStore()
        await store.markConsumed(connectionId, requestId)
        const updated = writeMappingStub.firstCall.args[0]
        assert.strictEqual(updated.deepLink[connectionId].requests[requestId].status, 'consumed')
    })

    it('marks request as pending', async () => {
        const store = new SessionStore()
        await store.markPending(connectionId, 'newReq')
        const updated = writeMappingStub.firstCall.args[0]
        assert.strictEqual(updated.deepLink[connectionId].requests['newReq'].status, 'pending')
    })

    it('sets session entry with default fresh status', async () => {
        const store = new SessionStore()
        const info: SsmConnectionInfo = {
            sessionId: 's99',
            token: 't99',
            url: 'u99',
        }
        await store.setSession(connectionId, 'r99', info)
        const written = writeMappingStub.firstCall.args[0]
        assert.deepStrictEqual(written.deepLink[connectionId].requests['r99'], {
            sessionId: 's99',
            token: 't99',
            url: 'u99',
            status: 'fresh',
        })
    })

    it('cleans up expired connection', async () => {
        const store = new SessionStore()
        await store.cleanupExpiredConnection(connectionId)
        const updated = writeMappingStub.firstCall.args[0]
        assert.strictEqual(updated.deepLink[connectionId], undefined)
    })

    it('does not throw when cleaning up non-existent connection', async () => {
        const store = new SessionStore()
        await store.cleanupExpiredConnection('non-existent-connection')
        assert(writeMappingStub.notCalled)
    })

    it('cleans up only the specified connection without affecting other connections', async () => {
        const store = new SessionStore()
        const otherConnectionId = 'other-connection'
        readMappingStub.returns({
            deepLink: {
                [connectionId]: {
                    refreshUrl: undefined,
                    requests: {
                        'initial-connection': { sessionId: 's1', token: 't1', url: 'u1', status: 'fresh' },
                    },
                },
                [otherConnectionId]: {
                    refreshUrl: 'https://refresh.url',
                    requests: {
                        'initial-connection': { sessionId: 's2', token: 't2', url: 'u2', status: 'fresh' },
                    },
                },
            },
        })

        await store.cleanupExpiredConnection(connectionId)
        const updated = writeMappingStub.firstCall.args[0]
        assert.strictEqual(updated.deepLink[connectionId], undefined)
        assert.ok(updated.deepLink[otherConnectionId])
        assert.ok(updated.deepLink[otherConnectionId].requests['initial-connection'])
    })
})
