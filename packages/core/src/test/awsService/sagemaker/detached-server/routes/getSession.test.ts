/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { handleGetSession } from '../../../../../awsService/sagemaker/detached-server/routes/getSession'
import * as credentials from '../../../../../awsService/sagemaker/detached-server/credentials'
import * as utils from '../../../../../awsService/sagemaker/detached-server/utils'
import * as errorPage from '../../../../../awsService/sagemaker/detached-server/errorPage'

describe('handleGetSession', () => {
    let req: Partial<http.IncomingMessage>
    let res: Partial<http.ServerResponse>
    let resWriteHead: sinon.SinonSpy
    let resEnd: sinon.SinonSpy

    beforeEach(() => {
        resWriteHead = sinon.spy()
        resEnd = sinon.spy()

        res = {
            writeHead: resWriteHead,
            end: resEnd,
        }
        sinon.stub(errorPage, 'openErrorPage')
    })

    it('responds with 400 if connection_identifier is missing', async () => {
        req = { url: '/session' }
        await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(400))
        assert(resEnd.calledWithMatch(/Missing required query parameter/))
    })

    it('responds with 500 if resolveCredentialsFor throws', async () => {
        req = { url: '/session?connection_identifier=arn:aws:sagemaker:us-west-2:123456789012:space/domain/name' }
        sinon.stub(credentials, 'resolveCredentialsFor').rejects(new Error('creds error'))

        await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
        assert(resEnd.calledWith('creds error'))
    })

    it('responds with 500 if startSagemakerSession throws', async () => {
        req = { url: '/session?connection_identifier=arn:aws:sagemaker:us-west-2:123456789012:space/domain/name' }
        sinon.stub(credentials, 'resolveCredentialsFor').resolves({})
        sinon.stub(utils, 'startSagemakerSession').rejects(new Error('session error'))

        await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
        assert(resEnd.calledWith('Failed to start SageMaker session'))
    })

    it('responds with 200 and session data on success', async () => {
        req = { url: '/session?connection_identifier=arn:aws:sagemaker:us-west-2:123456789012:space/domain/name' }
        sinon.stub(credentials, 'resolveCredentialsFor').resolves({})
        sinon.stub(utils, 'startSagemakerSession').resolves({
            SessionId: 'abc123',
            StreamUrl: 'https://stream',
            TokenValue: 'token123',
            $metadata: { httpStatusCode: 200 },
        })

        await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(200))
        assert(
            resEnd.calledWithMatch(
                JSON.stringify({
                    SessionId: 'abc123',
                    StreamUrl: 'https://stream',
                    TokenValue: 'token123',
                })
            )
        )
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('retry cap', () => {
        const retryArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/domain/retry-test'
        const retryUrl = `/session?connection_identifier=${retryArn}`

        beforeEach(() => {
            sinon.stub(credentials, 'resolveCredentialsFor').rejects(new Error('disconnected'))
        })

        async function callOnce() {
            resWriteHead = sinon.spy()
            resEnd = sinon.spy()
            res = { writeHead: resWriteHead, end: resEnd }
            req = { url: retryUrl }
            await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)
            return resWriteHead.firstCall.args[0] as number
        }

        it('allows requests up to maxRetries', async () => {
            for (let i = 0; i < 8; i++) {
                const status = await callOnce()
                assert.strictEqual(status, 500, `attempt ${i + 1} should return 500`)
            }
        })

        it('returns 429 after maxRetries exceeded', async () => {
            for (let i = 0; i < 8; i++) {
                await callOnce()
            }
            const status = await callOnce()
            assert.strictEqual(status, 429)
        })

        it('resets counter after resetWindowMs elapses', async () => {
            const realNow = Date.now
            try {
                let fakeTime = 1000000
                Date.now = () => fakeTime

                for (let i = 0; i < 8; i++) {
                    await callOnce()
                }
                assert.strictEqual(await callOnce(), 429)

                // Advance past the 10-minute reset window
                fakeTime += 10 * 60 * 1000 + 1
                const status = await callOnce()
                assert.strictEqual(status, 500, 'should allow requests again after reset window')
            } finally {
                Date.now = realNow
            }
        })

        it('resets counter on successful session', async () => {
            const successArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/domain/success-test'
            const successUrl = `/session?connection_identifier=${successArn}`

            // Use up some retries with failures
            credentials.resolveCredentialsFor.restore()
            sinon.stub(credentials, 'resolveCredentialsFor').resolves({})
            sinon.stub(utils, 'startSagemakerSession').rejects(new Error('fail'))

            for (let i = 0; i < 5; i++) {
                req = { url: successUrl }
                resWriteHead = sinon.spy()
                resEnd = sinon.spy()
                res = { writeHead: resWriteHead, end: resEnd }
                await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)
            }

            // Now succeed
            utils.startSagemakerSession.restore()
            sinon.stub(utils, 'startSagemakerSession').resolves({
                SessionId: 's',
                StreamUrl: 'wss://x',
                TokenValue: 't',
                $metadata: { httpStatusCode: 200 },
            })

            req = { url: successUrl }
            resWriteHead = sinon.spy()
            resEnd = sinon.spy()
            res = { writeHead: resWriteHead, end: resEnd }
            await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)
            assert.strictEqual(resWriteHead.firstCall.args[0], 200)

            // Should be able to fail 8 more times (counter was reset)
            utils.startSagemakerSession.restore()
            sinon.stub(utils, 'startSagemakerSession').rejects(new Error('fail'))

            for (let i = 0; i < 8; i++) {
                req = { url: successUrl }
                resWriteHead = sinon.spy()
                resEnd = sinon.spy()
                res = { writeHead: resWriteHead, end: resEnd }
                await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)
                assert.strictEqual(resWriteHead.firstCall.args[0], 500, `attempt ${i + 1} after reset should be 500`)
            }
        })
    })
})
