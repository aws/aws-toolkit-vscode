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
        req = { url: '/session?connection_identifier=arn:aws:sagemaker:region:acc:space/domain/name' }
        sinon.stub(credentials, 'resolveCredentialsFor').rejects(new Error('creds error'))
        sinon.stub(utils, 'parseArn').returns({
            region: 'us-west-2',
            accountId: '123456789012',
        })

        await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
        assert(resEnd.calledWith('creds error'))
    })

    it('responds with 500 if startSagemakerSession throws', async () => {
        req = { url: '/session?connection_identifier=arn:aws:sagemaker:region:acc:space/domain/name' }
        sinon.stub(credentials, 'resolveCredentialsFor').resolves({})
        sinon.stub(utils, 'parseArn').returns({
            region: 'us-west-2',
            accountId: '123456789012',
        })
        sinon.stub(utils, 'startSagemakerSession').rejects(new Error('session error'))

        await handleGetSession(req as http.IncomingMessage, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
        assert(resEnd.calledWith('Failed to start SageMaker session'))
    })

    it('responds with 200 and session data on success', async () => {
        req = { url: '/session?connection_identifier=arn:aws:sagemaker:region:acc:space/domain/name' }
        sinon.stub(credentials, 'resolveCredentialsFor').resolves({})
        sinon.stub(utils, 'parseArn').returns({
            region: 'us-west-2',
            accountId: '123456789012',
        })
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
})
