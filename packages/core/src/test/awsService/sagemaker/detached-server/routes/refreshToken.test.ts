/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { SessionStore } from '../../../../../awsService/sagemaker/detached-server/sessionStore'
import { handleRefreshToken } from '../../../../../awsService/sagemaker/detached-server/routes/refreshToken'

describe('handleRefreshToken', () => {
    let req: Partial<http.IncomingMessage>
    let res: Partial<http.ServerResponse>
    let resWriteHead: sinon.SinonSpy
    let resEnd: sinon.SinonSpy
    let storeStub: sinon.SinonStubbedInstance<SessionStore>

    beforeEach(() => {
        resWriteHead = sinon.spy()
        resEnd = sinon.spy()

        res = {
            writeHead: resWriteHead,
            end: resEnd,
        }

        storeStub = sinon.createStubInstance(SessionStore)
        sinon.stub(SessionStore.prototype, 'setSession').callsFake(storeStub.setSession)
    })

    it('responds with 400 if any required query parameter is missing', async () => {
        req = { url: '/refresh?connection_identifier=abc&request_id=req123' } // missing others

        await handleRefreshToken(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(400))
        assert(resEnd.calledWithMatch(/Missing required parameters/))
    })

    it('responds with 500 if setSession throws', async () => {
        req = {
            url: '/refresh?connection_identifier=abc&request_id=req123&ws_url=wss://abc&token=tok123&session=sess123',
        }
        storeStub.setSession.throws(new Error('store error'))

        await handleRefreshToken(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
        assert(resEnd.calledWith('Failed to save session token'))
    })

    it('responds with 200 if session is saved successfully', async () => {
        req = {
            url: '/refresh?connection_identifier=abc&request_id=req123&ws_url=wss://abc&token=tok123&session=sess123',
        }

        await handleRefreshToken(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(200))
        assert(resEnd.calledWith('Session token refreshed successfully'))
        assert(
            storeStub.setSession.calledWith('abc', 'req123', {
                sessionId: 'sess123',
                token: 'tok123',
                url: 'wss://abc',
            })
        )
    })

    afterEach(() => {
        sinon.restore()
    })
})
