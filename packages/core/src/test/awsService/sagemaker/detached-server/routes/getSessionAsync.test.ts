/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { SessionStore } from '../../../../../awsService/sagemaker/detached-server/sessionStore'
import { handleGetSessionAsync } from '../../../../../awsService/sagemaker/detached-server/routes/getSessionAsync'

describe('handleGetSessionAsync', () => {
    let req: Partial<http.IncomingMessage>
    let res: Partial<http.ServerResponse>
    let resWriteHead: sinon.SinonSpy
    let resEnd: sinon.SinonSpy
    let storeStub: sinon.SinonStubbedInstance<SessionStore>

    beforeEach(() => {
        resWriteHead = sinon.spy()
        resEnd = sinon.spy()
        res = { writeHead: resWriteHead, end: resEnd }

        storeStub = sinon.createStubInstance(SessionStore)
        sinon.stub(SessionStore.prototype, 'getFreshEntry').callsFake(storeStub.getFreshEntry)
        sinon.stub(SessionStore.prototype, 'getStatus').callsFake(storeStub.getStatus)
        sinon.stub(SessionStore.prototype, 'getRefreshUrl').callsFake(storeStub.getRefreshUrl)
        sinon.stub(SessionStore.prototype, 'markPending').callsFake(storeStub.markPending)
    })

    it('responds with 400 if required query parameters are missing', async () => {
        req = { url: '/session_async?connection_identifier=abc' } // missing request_id
        await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(400))
        assert(resEnd.calledWithMatch(/Missing required query parameters/))
    })

    it('responds with 200 and session data if freshEntry exists', async () => {
        req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
        storeStub.getFreshEntry.returns(Promise.resolve({ sessionId: 'sid', token: 'tok', url: 'wss://test' }))

        await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(200))
        const actualJson = JSON.parse(resEnd.firstCall.args[0])
        assert.deepStrictEqual(actualJson, {
            SessionId: 'sid',
            TokenValue: 'tok',
            StreamUrl: 'wss://test',
        })
    })

    // Temporarily disabling reconnect logic for the 7/3 Phase 1 launch.
    // Will re-enable in the next release around 7/14.

    // it('responds with 204 if session is pending', async () => {
    //     req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
    //     storeStub.getFreshEntry.returns(Promise.resolve(undefined))
    //     storeStub.getStatus.returns(Promise.resolve('pending'))

    //     await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

    //     assert(resWriteHead.calledWith(204))
    //     assert(resEnd.calledOnce)
    // })

    // it('responds with 202 if status is not-started and opens browser', async () => {
    //     req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

    //     storeStub.getFreshEntry.returns(Promise.resolve(undefined))
    //     storeStub.getStatus.returns(Promise.resolve('not-started'))
    //     storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh'))
    //     storeStub.markPending.returns(Promise.resolve())

    //     sinon.stub(utils, 'readServerInfo').resolves({ pid: 1234, port: 4567 })
    //     sinon.stub(utils, 'open').resolves()
    //     await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

    //     assert(resWriteHead.calledWith(202))
    //     assert(resEnd.calledWithMatch(/Session is not ready yet/))
    //     assert(storeStub.markPending.calledWith('abc', 'req123'))
    // })

    // it('responds with 500 if unexpected error occurs', async () => {
    //     req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
    //     storeStub.getFreshEntry.throws(new Error('fail'))

    //     await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

    //     assert(resWriteHead.calledWith(500))
    //     assert(resEnd.calledWith('Unexpected error'))
    // })

    afterEach(() => {
        sinon.restore()
    })
})
