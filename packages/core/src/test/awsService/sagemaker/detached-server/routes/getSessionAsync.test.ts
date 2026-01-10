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
        sinon.stub(SessionStore.prototype, 'cleanupExpiredConnection').callsFake(storeStub.cleanupExpiredConnection)
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

    it('responds with 204 if session is pending', async () => {
        req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
        storeStub.getFreshEntry.returns(Promise.resolve(undefined))
        storeStub.getStatus.returns(Promise.resolve('pending'))

        await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(204))
        assert(resEnd.calledOnce)
    })

    it('responds with 202 if status is not-started and opens browser', async () => {
        req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

        storeStub.getFreshEntry.returns(Promise.resolve(undefined))
        storeStub.getStatus.returns(Promise.resolve('not-started'))
        storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh'))
        storeStub.markPending.returns(Promise.resolve())

        sinon.stub(utils, 'readServerInfo').resolves({ pid: 1234, port: 4567 })
        sinon
            .stub(utils, 'parseArn')
            .returns({ region: 'us-east-1', accountId: '123456789012', spaceName: 'test-space' })
        sinon.stub(utils, 'open').resolves()
        await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(202))
        assert(resEnd.calledWithMatch(/Session is not ready yet/))
        assert(storeStub.markPending.calledWith('abc', 'req123'))
    })

    it('responds with 500 if unexpected error occurs', async () => {
        req = { url: '/session_async?connection_identifier=abc&request_id=req123' }
        storeStub.getFreshEntry.throws(new Error('fail'))

        await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
        assert(resEnd.calledWith('Unexpected error'))
    })

    describe('SMUS session expiration handling', () => {
        let openErrorPageStub: sinon.SinonStub

        beforeEach(() => {
            // Stub the openErrorPage function to prevent actual browser opening
            openErrorPageStub = sinon.stub(errorPage, 'openErrorPage').resolves()
        })

        it('handles SMUS session expiration when refreshUrl is undefined', async () => {
            req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            storeStub.getStatus.returns(Promise.resolve('not-started'))
            storeStub.getRefreshUrl.returns(Promise.resolve(undefined)) // SMUS case: no refreshUrl
            storeStub.cleanupExpiredConnection.resolves()

            await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

            // Verify HTTP 400 response with correct error structure
            assert(resWriteHead.calledWith(400))
            const actualJson = JSON.parse(resEnd.firstCall.args[0])
            assert.strictEqual(actualJson.error, SmusDeeplinkSessionExpiredError.code)
            assert.strictEqual(actualJson.message, SmusDeeplinkSessionExpiredError.shortMessage)

            // Verify cleanup was called
            assert(storeStub.cleanupExpiredConnection.calledOnce)
            assert(storeStub.cleanupExpiredConnection.calledWith('abc'))

            // Verify error page was opened with correct message
            assert(openErrorPageStub.calledOnce)
            assert.strictEqual(openErrorPageStub.firstCall.args[0], SmusDeeplinkSessionExpiredError.title)
            assert.strictEqual(openErrorPageStub.firstCall.args[1], SmusDeeplinkSessionExpiredError.message)
        })

        it('responds with 400 even if cleanup fails', async () => {
            req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            storeStub.getStatus.returns(Promise.resolve('not-started'))
            storeStub.getRefreshUrl.returns(Promise.resolve(undefined))
            storeStub.cleanupExpiredConnection.rejects(new Error('cleanup failed'))

            await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

            assert(resWriteHead.calledWith(400))
            const actualJson = JSON.parse(resEnd.firstCall.args[0])
            assert.strictEqual(actualJson.error, SmusDeeplinkSessionExpiredError.code)
        })

        it('responds with 202 when refreshUrl is valid (existing SageMaker AI flow)', async () => {
            req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            storeStub.getStatus.returns(Promise.resolve('not-started'))
            storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh')) // Valid refreshUrl
            storeStub.markPending.returns(Promise.resolve())

            sinon.stub(utils, 'readServerInfo').resolves({ pid: 1234, port: 4567 })
            sinon
                .stub(utils, 'parseArn')
                .returns({ region: 'us-east-1', accountId: '123456789012', spaceName: 'test-space' })
            sinon.stub(utils, 'open').resolves()

            await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

            // Verify SageMaker AI flow still works correctly
            assert(resWriteHead.calledWith(202))
            assert(resEnd.calledWithMatch(/Session is not ready yet/))
            assert(storeStub.markPending.calledWith('abc', 'req123'))
        })

        it('does not call cleanupExpiredConnection for SageMaker AI connections', async () => {
            req = { url: '/session_async?connection_identifier=abc&request_id=req123' }

            storeStub.getFreshEntry.returns(Promise.resolve(undefined))
            storeStub.getStatus.returns(Promise.resolve('not-started'))
            storeStub.getRefreshUrl.returns(Promise.resolve('https://example.com/refresh'))
            storeStub.markPending.returns(Promise.resolve())
            storeStub.cleanupExpiredConnection.resolves()

            sinon.stub(utils, 'readServerInfo').resolves({ pid: 1234, port: 4567 })
            sinon
                .stub(utils, 'parseArn')
                .returns({ region: 'us-east-1', accountId: '123456789012', spaceName: 'test-space' })
            sinon.stub(utils, 'open').resolves()

            await handleGetSessionAsync(req as http.IncomingMessage, res as http.ServerResponse)

            // Verify cleanup was NOT called
            assert(storeStub.cleanupExpiredConnection.notCalled)
        })
    })

    afterEach(() => {
        sinon.restore()
    })
})
