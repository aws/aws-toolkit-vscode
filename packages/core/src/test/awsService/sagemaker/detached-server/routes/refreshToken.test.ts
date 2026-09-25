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
import * as hyperpodMappingUtils from '../../../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'

describe('handleRefreshToken', () => {
    let ctx: RouteTestContext
    let readHyperpodMappingStub: sinon.SinonStub
    let writeHyperpodMappingStub: sinon.SinonStub

    beforeEach(() => {
        ctx = createRouteTestContext()
        sinon.stub(SessionStore.prototype, 'setSession').callsFake(ctx.storeStub.setSession)
        readHyperpodMappingStub = sinon.stub(hyperpodMappingUtils, 'readHyperpodMapping')
        writeHyperpodMappingStub = sinon.stub(hyperpodMappingUtils, 'writeHyperpodMapping').resolves()
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

    describe('HyperPod connection key handling', () => {
        it('writes fresh entry to hyperpod mapping file for HyperPod connection key', async () => {
            ctx.req = {
                url: '/refresh?connection_identifier=mg-test%3Adefault%3Amy-cluster&request_id=req1&ws_url=wss://stream&token=tok&session=sess',
            }
            readHyperpodMappingStub.resolves({})

            await handleRefreshToken(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            assert(writeHyperpodMappingStub.calledOnce)
            const writtenMapping = writeHyperpodMappingStub.firstCall.args[0]
            assert.deepStrictEqual(writtenMapping.deepLink['mg-test:default:my-cluster'].requests['req1'], {
                sessionId: 'sess',
                token: 'tok',
                url: 'wss://stream',
                status: 'fresh',
            })
            assert(ctx.resWriteHead.calledWith(200))
        })

        it('does not use SessionStore for HyperPod connection keys', async () => {
            ctx.req = {
                url: '/refresh?connection_identifier=ws%3Ans%3Acluster&request_id=req1&ws_url=wss://s&token=t&session=s',
            }
            readHyperpodMappingStub.resolves({})

            await handleRefreshToken(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            // SessionStore.setSession should NOT be called for HyperPod keys
            assert(ctx.storeStub.setSession.notCalled)
            assert(ctx.resWriteHead.calledWith(200))
        })

        it('uses SessionStore for ARN-based connection identifiers', async () => {
            ctx.req = {
                url: '/refresh?connection_identifier=arn%3Aaws%3Asagemaker%3Aus-west-2%3A123%3Aspace%2Fmy-space&request_id=req1&ws_url=wss://s&token=t&session=s',
            }

            await handleRefreshToken(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            // writeHyperpodMapping should NOT be called for ARN-based identifiers
            assert(writeHyperpodMappingStub.notCalled)
            // SessionStore should be used instead
            assert(ctx.storeStub.setSession.calledOnce)
            assert(ctx.resWriteHead.calledWith(200))
        })

        it('preserves existing deepLink entries when adding new request', async () => {
            ctx.req = {
                url: '/refresh?connection_identifier=ws%3Ans%3Acluster&request_id=req2&ws_url=wss://new&token=newtok&session=newsess',
            }
            readHyperpodMappingStub.resolves({
                deepLink: {
                    'ws:ns:cluster': {
                        requests: { req1: { sessionId: 'old', url: 'wss://old', token: 'old', status: 'consumed' } },
                    },
                },
            })

            await handleRefreshToken(ctx.req as http.IncomingMessage, ctx.res as http.ServerResponse)

            assert(writeHyperpodMappingStub.calledOnce)
            const written = writeHyperpodMappingStub.firstCall.args[0]
            // Old entry preserved
            assert.strictEqual(written.deepLink['ws:ns:cluster'].requests['req1'].status, 'consumed')
            // New entry added
            assert.deepStrictEqual(written.deepLink['ws:ns:cluster'].requests['req2'], {
                sessionId: 'newsess',
                token: 'newtok',
                url: 'wss://new',
                status: 'fresh',
            })
        })
    })

    afterEach(() => {
        sinon.restore()
    })
})
