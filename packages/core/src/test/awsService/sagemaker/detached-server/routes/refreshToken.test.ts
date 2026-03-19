/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { SessionStore } from '../../../../../awsService/sagemaker/detached-server/sessionStore'
import { handleRefreshToken } from '../../../../../awsService/sagemaker/detached-server/routes/refreshToken'
import { createRouteTestContext, RouteTestContext } from './testUtils'

describe('handleRefreshToken', () => {
    let ctx: RouteTestContext

    beforeEach(() => {
        ctx = createRouteTestContext()
        sinon.stub(SessionStore.prototype, 'setSession').callsFake(ctx.storeStub.setSession)
    })

    it('responds with 400 if any required query parameter is missing', async () => {
        ctx.req = { url: '/refresh?connection_identifier=abc&request_id=req123' } // missing others

        await handleRefreshToken(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(400))
        assert(ctx.resEnd.calledWithMatch(/Missing required parameters/))
    })

    it('responds with 500 if setSession throws', async () => {
        ctx.req = {
            url: '/refresh?connection_identifier=abc&request_id=req123&ws_url=wss://abc&token=tok123&session=sess123',
        }
        ctx.storeStub.setSession.throws(new Error('store error'))

        await handleRefreshToken(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(500))
        assert(ctx.resEnd.calledWith('Failed to save session token'))
    })

    it('responds with 200 if session is saved successfully', async () => {
        ctx.req = {
            url: '/refresh?connection_identifier=abc&request_id=req123&ws_url=wss://abc&token=tok123&session=sess123',
        }

        await handleRefreshToken(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(200))
        assert(ctx.resEnd.calledWith('Session token refreshed successfully'))
        assert(
            ctx.storeStub.setSession.calledWith('abc', 'req123', {
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
