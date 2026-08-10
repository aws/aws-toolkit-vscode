/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { SessionStore } from '../../../../../awsService/sagemaker/detached-server/sessionStore'
import { handleGetSessionAsync } from '../../../../../awsService/sagemaker/detached-server/routes/getSessionAsync'
import * as utils from '../../../../../awsService/sagemaker/detached-server/utils'
import * as errorPage from '../../../../../awsService/sagemaker/detached-server/errorPage'
import { SmusDeeplinkSessionExpiredError } from '../../../../../awsService/sagemaker/constants'
import { createRouteTestContext, RouteTestContext } from './testUtils'

function stubSagemakerBrowserFlow() {
    sinon.stub(utils, 'readServerInfo').resolves({ pid: 1234, port: 4567 })
    sinon
        .stub(utils, 'parseArn')
        .returns({ region: 'us-east-1', accountId: '123456789012', resourceName: 'test-space' })
    sinon.stub(utils, 'open').resolves()
}

describe('handleGetSessionAsync', () => {
    let ctx: RouteTestContext

    let openErrorPageStub: sinon.SinonStub

    beforeEach(() => {
        ctx = createRouteTestContext()
        sinon.stub(SessionStore.prototype, 'getFreshEntry').callsFake(ctx.storeStub.getFreshEntry)
        sinon.stub(SessionStore.prototype, 'getStatus').callsFake(ctx.storeStub.getStatus)
        sinon.stub(SessionStore.prototype, 'getRefreshUrl').callsFake(ctx.storeStub.getRefreshUrl)
        sinon.stub(SessionStore.prototype, 'getIsSMUS').callsFake(ctx.storeStub.getIsSMUS)
        sinon.stub(SessionStore.prototype, 'getAutoRefreshEnabled').callsFake(ctx.storeStub.getAutoRefreshEnabled)
        sinon.stub(SessionStore.prototype, 'markPending').callsFake(ctx.storeStub.markPending)
        sinon.stub(SessionStore.prototype, 'cleanupExpiredConnection').callsFake(ctx.storeStub.cleanupExpiredConnection)
        openErrorPageStub = sinon.stub(errorPage, 'openErrorPage').resolves()
    })

    it('responds with 400 if required query parameters are missing', async () => {
        ctx.req = { url: '/session_async?connection_identifier=abc' } // missing request_id
        await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(400))
        assert(ctx.resEnd.calledWithMatch(/Missing required query parameters/))
    })

    it('responds with 200 and session data if freshEntry exists', async () => {
        ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
        ctx.storeStub.getFreshEntry.returns(Promise.resolve({ sessionId: 'sid', token: 'tok', url: 'wss://test' }))

        await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(200))
        const actualJson = JSON.parse(ctx.resEnd.firstCall.args[0])
        assert.deepStrictEqual(actualJson, {
            SessionId: 'sid',
            TokenValue: 'tok',
            StreamUrl: 'wss://test',
        })
    })

    it('responds with 204 if session is pending', async () => {
        ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
        ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
        ctx.storeStub.getStatus.returns(Promise.resolve('pending'))

        await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(204))
        assert(ctx.resEnd.calledOnce)
    })

    it('responds with 202 if status is not-started and opens browser', async () => {
        ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

        ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
        ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
        ctx.storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh'))
        ctx.storeStub.markPending.returns(Promise.resolve())

        stubSagemakerBrowserFlow()
        await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(202))
        assert(ctx.resEnd.calledWithMatch(/Session is not ready yet/))
        assert(ctx.storeStub.markPending.calledWith('abc', 'req123'))
    })

    it('responds with 500 if unexpected error occurs', async () => {
        ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
        ctx.storeStub.getFreshEntry.throws(new Error('fail'))

        await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

        assert(ctx.resWriteHead.calledWith(500))
        assert(ctx.resEnd.calledWith('Unexpected error'))
    })

    describe('SMUS session expiration handling', () => {
        it('handles SMUS session expiration when refreshUrl is undefined', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve(undefined)) // SMUS case: no refreshUrl
            ctx.storeStub.cleanupExpiredConnection.resolves()

            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            // Verify HTTP 400 response with correct error structure
            assert(ctx.resWriteHead.calledWith(400))
            const actualJson = JSON.parse(ctx.resEnd.firstCall.args[0])
            assert.strictEqual(actualJson.error, SmusDeeplinkSessionExpiredError.code)
            assert.strictEqual(actualJson.message, SmusDeeplinkSessionExpiredError.shortMessage)

            // Verify cleanup was called
            assert(ctx.storeStub.cleanupExpiredConnection.calledOnce)
            assert(ctx.storeStub.cleanupExpiredConnection.calledWith('abc'))

            // Verify error page was opened with correct message
            assert(openErrorPageStub.calledOnce)
            assert.strictEqual(openErrorPageStub.firstCall.args[0], SmusDeeplinkSessionExpiredError.title)
            assert.strictEqual(openErrorPageStub.firstCall.args[1], SmusDeeplinkSessionExpiredError.message)
        })

        it('responds with 400 even if cleanup fails', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve(undefined))
            ctx.storeStub.cleanupExpiredConnection.rejects(new Error('cleanup failed'))

            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            assert(ctx.resWriteHead.calledWith(400))
            const actualJson = JSON.parse(ctx.resEnd.firstCall.args[0])
            assert.strictEqual(actualJson.error, SmusDeeplinkSessionExpiredError.code)
        })

        it('returns 400 when SMUS and autoRefreshEnabled is false (gate OFF)', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve(undefined))
            ctx.storeStub.getAutoRefreshEnabled.returns(Promise.resolve(false))
            ctx.storeStub.cleanupExpiredConnection.resolves()

            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            assert(ctx.resWriteHead.calledWith(400))
            const actualJson = JSON.parse(ctx.resEnd.firstCall.args[0])
            assert.strictEqual(actualJson.error, SmusDeeplinkSessionExpiredError.code)
            assert(ctx.storeStub.cleanupExpiredConnection.calledOnce)
        })

        it('responds with 202 when refreshUrl is valid (existing SageMaker AI flow)', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh')) // Valid refreshUrl
            ctx.storeStub.markPending.returns(Promise.resolve())

            stubSagemakerBrowserFlow()

            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            // Verify SageMaker AI flow still works correctly
            assert(ctx.resWriteHead.calledWith(202))
            assert(ctx.resEnd.calledWithMatch(/Session is not ready yet/))
            assert(ctx.storeStub.markPending.calledWith('abc', 'req123'))
        })

        it('proceeds to refresh flow when SMUS and autoRefreshEnabled is true (gate ON)', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve(undefined))
            ctx.storeStub.getAutoRefreshEnabled.returns(Promise.resolve(true))
            ctx.storeStub.getIsSMUS.returns(Promise.resolve(true))
            ctx.storeStub.markPending.returns(Promise.resolve())

            stubSagemakerBrowserFlow()
            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            assert(ctx.resWriteHead.calledWith(202))
            assert(ctx.resEnd.calledWithMatch(/Session is not ready yet/))
            assert(ctx.storeStub.cleanupExpiredConnection.notCalled)
        })

        it('returns 400 when SMUS has refreshUrl but autoRefreshEnabled is false (gate blocks reconnect)', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve('https://smus-console.example.com/refresh'))
            ctx.storeStub.getAutoRefreshEnabled.returns(Promise.resolve(false))
            ctx.storeStub.getIsSMUS.returns(Promise.resolve(true))
            ctx.storeStub.cleanupExpiredConnection.resolves()

            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            assert(ctx.resWriteHead.calledWith(400))
            const actualJson = JSON.parse(ctx.resEnd.firstCall.args[0])
            assert.strictEqual(actualJson.error, SmusDeeplinkSessionExpiredError.code)
            assert(ctx.storeStub.cleanupExpiredConnection.calledOnce)
        })

        it('SM-AI always reconnects when refreshUrl exists regardless of autoRefreshEnabled', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh'))
            ctx.storeStub.getAutoRefreshEnabled.returns(Promise.resolve(false))
            ctx.storeStub.getIsSMUS.returns(Promise.resolve(false))
            ctx.storeStub.markPending.returns(Promise.resolve())

            stubSagemakerBrowserFlow()

            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            assert(ctx.resWriteHead.calledWith(202))
            assert(ctx.resEnd.calledWithMatch(/Session is not ready yet/))
            assert(ctx.storeStub.cleanupExpiredConnection.notCalled)
        })

        it('does not call cleanupExpiredConnection for SageMaker AI connections', async () => {
            ctx.req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            ctx.storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            ctx.storeStub.getStatus.returns(Promise.resolve('not-started'))
            ctx.storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh'))
            ctx.storeStub.markPending.returns(Promise.resolve())
            ctx.storeStub.cleanupExpiredConnection.resolves()

            stubSagemakerBrowserFlow()

            await handleGetSessionAsync(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            // Verify cleanup was NOT called
            assert(ctx.storeStub.cleanupExpiredConnection.notCalled)
        })
    })

    afterEach(() => {
        sinon.restore()
    })
})
