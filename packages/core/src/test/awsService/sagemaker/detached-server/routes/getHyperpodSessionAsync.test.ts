/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { handleGetHyperpodSessionAsync } from '../../../../../awsService/sagemaker/detached-server/routes/getHyperpodSessionAsync'
import * as hyperpodMappingUtils from '../../../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'
import * as getHyperpodSessionModule from '../../../../../awsService/sagemaker/detached-server/routes/getHyperpodSession'

describe('handleGetHyperpodSessionAsync', () => {
    let resWriteHead: sinon.SinonSpy
    let resEnd: sinon.SinonSpy
    let req: Partial<http.IncomingMessage>
    let res: Partial<http.ServerResponse>
    let getFreshEntryStub: sinon.SinonStub
    let getStatusStub: sinon.SinonStub
    let handleGetHyperpodSessionStub: sinon.SinonStub

    beforeEach(() => {
        resWriteHead = sinon.spy()
        resEnd = sinon.spy()
        res = { writeHead: resWriteHead, end: resEnd }
        getFreshEntryStub = sinon.stub(hyperpodMappingUtils, 'getHyperpodFreshEntry')
        getStatusStub = sinon.stub(hyperpodMappingUtils, 'getHyperpodRequestStatus')
        handleGetHyperpodSessionStub = sinon.stub(getHyperpodSessionModule, 'handleGetHyperpodSession').resolves()
    })

    afterEach(() => {
        sinon.restore()
    })

    it('returns 400 when connection_key is missing', async () => {
        req = { url: '/get_hyperpod_session_async' }
        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(400))
        assert(resEnd.calledWith(sinon.match('Missing required query parameter')))
    })

    it('returns 200 with session data when fresh entry exists', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.resolves({
            sessionId: 'sess-1',
            url: 'wss://ssmmessages.us-east-2.amazonaws.com/session',
            token: 'tok-1',
        })

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(200, { 'Content-Type': 'application/json' }))
        const body = JSON.parse(resEnd.firstCall.args[0])
        assert.strictEqual(body.SessionId, 'sess-1')
        assert.strictEqual(body.StreamUrl, 'wss://ssmmessages.us-east-2.amazonaws.com/session')
        assert.strictEqual(body.TokenValue, 'tok-1')
    })

    it('returns 204 when status is pending', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.resolves(undefined)
        getStatusStub.resolves('pending')

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(204))
    })

    it('falls back to handleGetHyperpodSession when status is not-started', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.resolves(undefined)
        getStatusStub.resolves('not-started')

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(handleGetHyperpodSessionStub.calledOnce)
        assert(handleGetHyperpodSessionStub.calledWith(req, res))
    })

    it('falls back to handleGetHyperpodSession when status is consumed', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.resolves(undefined)
        getStatusStub.resolves('consumed')

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(handleGetHyperpodSessionStub.calledOnce)
        assert(handleGetHyperpodSessionStub.calledWith(req, res))
    })

    it('returns 500 on unexpected error', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.rejects(new Error('disk failure'))

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
    })

    it('uses initial-connection as default requestId', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster' }
        getFreshEntryStub.resolves({
            sessionId: 'sess-1',
            url: 'wss://example.com',
            token: 'tok-1',
        })

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(getFreshEntryStub.calledWith('ws:ns:cluster', 'initial-connection'))
    })
})
