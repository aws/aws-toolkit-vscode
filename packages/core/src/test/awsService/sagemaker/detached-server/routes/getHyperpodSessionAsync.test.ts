/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { handleGetHyperpodSessionAsync } from '../../../../../awsService/sagemaker/detached-server/routes/getHyperpodSessionAsync'
import * as hyperpodMappingUtils from '../../../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'
import * as utils from '../../../../../awsService/sagemaker/detached-server/utils'

describe('handleGetHyperpodSessionAsync', () => {
    let resWriteHead: sinon.SinonSpy
    let resEnd: sinon.SinonSpy
    let req: Partial<http.IncomingMessage>
    let res: Partial<http.ServerResponse>
    let getFreshEntryStub: sinon.SinonStub
    let getStatusStub: sinon.SinonStub

    beforeEach(() => {
        resWriteHead = sinon.spy()
        resEnd = sinon.spy()
        res = { writeHead: resWriteHead, end: resEnd }
        getFreshEntryStub = sinon.stub(hyperpodMappingUtils, 'getHyperpodFreshEntry')
        getStatusStub = sinon.stub(hyperpodMappingUtils, 'getHyperpodRequestStatus')
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

    it('triggers browser reconnection when status is not-started and refreshUrl available', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.resolves(undefined)
        getStatusStub.resolves('not-started')
        sinon.stub(hyperpodMappingUtils, 'readHyperpodMapping').resolves({
            localCredential: {
                'ws:ns:cluster': {
                    namespace: 'ns',
                    clusterArn: 'arn:aws:eks:us-west-2:123:cluster/cluster',
                    clusterName: 'cluster',
                    refreshUrl: 'https://studio.example.com/spaces/ws',
                },
            },
        })
        sinon.stub(utils, 'readServerInfo').resolves({ port: 9999, pid: 1234 })
        const openStub = sinon.stub(utils, 'open').resolves()

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(202))
        assert(openStub.calledOnce)
        const openedUrl = openStub.firstCall.args[0]
        assert(openedUrl.includes('reconnect_callback_url'))
        assert(openedUrl.includes('reconnect_request_id'))
        assert(openedUrl.includes('connection_identifier'))
    })

    it('returns 202 when status is consumed and no refreshUrl', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.resolves(undefined)
        getStatusStub.resolves('consumed')
        sinon.stub(hyperpodMappingUtils, 'readHyperpodMapping').resolves({
            localCredential: {
                'ws:ns:cluster': {
                    namespace: 'ns',
                    clusterArn: 'arn:aws:eks:us-west-2:123:cluster/cluster',
                    clusterName: 'cluster',
                },
            },
        })

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(202))
    })

    it('returns 500 on unexpected error', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=123' }
        getFreshEntryStub.rejects(new Error('disk failure'))

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
    })

    it('uses initial-connection as default requestId', async () => {
        req = { url: '/get_hyperpod_session_async?connection_key=other:ns:cluster' }
        getFreshEntryStub.resolves({
            sessionId: 'sess-1',
            url: 'wss://example.com',
            token: 'tok-1',
        })

        await handleGetHyperpodSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(getFreshEntryStub.calledWith('other:ns:cluster', 'initial-connection'))
    })
})
