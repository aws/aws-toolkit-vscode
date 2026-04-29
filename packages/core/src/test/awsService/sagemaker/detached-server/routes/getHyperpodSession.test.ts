/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { IncomingMessage, ServerResponse } from 'http'
import { handleGetHyperpodSession } from '../../../../../awsService/sagemaker/detached-server/routes/getHyperpodSession'
import * as hyperpodMappingUtils from '../../../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'

describe('handleGetHyperpodSession', function () {
    let readMappingStub: sinon.SinonStub
    let res: sinon.SinonStubbedInstance<ServerResponse>

    function createMockRequest(queryString: string): IncomingMessage {
        return { url: `/get_hyperpod_session${queryString}` } as IncomingMessage
    }

    beforeEach(function () {
        readMappingStub = sinon.stub(hyperpodMappingUtils, 'readHyperpodMapping')
        res = sinon.createStubInstance(ServerResponse) as sinon.SinonStubbedInstance<ServerResponse>
        res.writeHead.returns(res as any)
        res.end.returns(res as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('returns 400 when connection_key is missing', async function () {
        const req = createMockRequest('')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 400)
        sinon.assert.calledWith(res.end, sinon.match('Missing required query parameter'))
    })

    it('returns 404 when connection key is not found in mapping', async function () {
        readMappingStub.resolves({})
        const req = createMockRequest('?connection_key=unknown:ns:cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 404)
        sinon.assert.calledWith(res.end, sinon.match('No HyperPod connection found'))
    })

    it('returns 401 when mapping has no stored wsUrl/token', async function () {
        readMappingStub.resolves({
            'my-space:my-ns:my-cluster': {
                namespace: 'my-ns',
                clusterArn: 'arn:aws:sagemaker:us-east-1:123456789012:cluster/my-cluster',
                clusterName: 'my-cluster',
            },
        })
        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 401)
        sinon.assert.calledWith(res.end, sinon.match('No stored session credentials'))
    })

    it('returns 200 with stored session credentials', async function () {
        readMappingStub.resolves({
            'my-space:my-ns:my-cluster': {
                namespace: 'my-ns',
                clusterArn: 'arn:aws:sagemaker:us-east-1:123456789012:cluster/my-cluster',
                clusterName: 'my-cluster',
                wsUrl: 'wss://stream.example.com/session123',
                token: 'session-token-value',
            },
        })
        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 200, { 'Content-Type': 'application/json' })
        const responseBody = JSON.parse(res.end.firstCall.args[0] as string)
        assert.strictEqual(responseBody.SessionId, 'my-space:my-ns:my-cluster')
        assert.strictEqual(responseBody.StreamUrl, 'wss://stream.example.com/session123')
        assert.strictEqual(responseBody.TokenValue, 'session-token-value')
    })

    it('returns 500 when readHyperpodMapping throws', async function () {
        readMappingStub.rejects(new Error('File system error'))
        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 500)
        sinon.assert.calledWith(res.end, sinon.match('Failed to read HyperPod connection mapping'))
    })
})
