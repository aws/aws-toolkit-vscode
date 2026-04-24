/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { IncomingMessage, ServerResponse } from 'http'
import { handleGetHyperpodSession } from '../../../../../awsService/sagemaker/detached-server/routes/getHyperpodSession'
import * as hyperpodMappingUtils from '../../../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'
import * as kubectlClientStubModule from '../../../../../awsService/sagemaker/detached-server/kubectlClientStub'
import * as eksTokenGenerator from '../../../../../shared/clients/eksTokenGenerator'

describe('handleGetHyperpodSession', function () {
    let readMappingStub: sinon.SinonStub
    let res: sinon.SinonStubbedInstance<ServerResponse>

    const validMapping: hyperpodMappingUtils.HyperpodMappings = {
        'my-space:my-ns:my-cluster': {
            namespace: 'my-ns',
            clusterArn: 'arn:aws:sagemaker:us-east-1:123456789012:cluster/my-cluster',
            clusterName: 'my-cluster',
            endpoint: 'https://eks.us-east-1.amazonaws.com',
            certificateAuthorityData: 'dGVzdC1jYS1kYXRh',
            region: 'us-east-1',
            accountId: '123456789012',
            eksClusterName: 'my-eks-cluster',
            credentials: {
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                sessionToken: 'FwoGZXIvYXdzEBYaDH...',
            },
        },
    }

    function createMockRequest(queryString: string): IncomingMessage {
        return { url: `/get_hyperpod_session${queryString}` } as IncomingMessage
    }

    beforeEach(function () {
        readMappingStub = sinon.stub(hyperpodMappingUtils, 'readHyperpodMapping')
        sinon.stub(eksTokenGenerator, 'generateEksToken').resolves({
            token: 'k8s-aws-v1.fake-token',
            expiresAt: new Date(Date.now() + 900_000),
        })

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

    it('returns 401 when mapping has no stored credentials', async function () {
        const noCredsMapping: hyperpodMappingUtils.HyperpodMappings = {
            'my-space:my-ns:my-cluster': {
                ...validMapping['my-space:my-ns:my-cluster'],
                credentials: undefined,
            },
        }
        readMappingStub.resolves(noCredsMapping)
        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 401)
        sinon.assert.calledWith(res.end, sinon.match('No stored credentials'))
    })

    it('returns 422 when mapping is missing EKS cluster metadata', async function () {
        const noEksMapping: hyperpodMappingUtils.HyperpodMappings = {
            'my-space:my-ns:my-cluster': {
                ...validMapping['my-space:my-ns:my-cluster'],
                endpoint: undefined,
                eksClusterName: undefined,
            },
        }
        readMappingStub.resolves(noEksMapping)
        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 422)
        sinon.assert.calledWith(res.end, sinon.match('Missing EKS cluster metadata'))
    })

    it('returns 200 with session info on successful workspace connection', async function () {
        readMappingStub.resolves(validMapping)

        const fakeConnection = {
            type: 'vscode-remote',
            url: 'wss://stream.example.com/session123',
            token: 'session-token-value',
            sessionId: 'session-123',
        }
        const createConnectionStub = sinon.stub(
            kubectlClientStubModule.KubectlClient.prototype,
            'createWorkspaceConnection'
        )
        createConnectionStub.resolves(fakeConnection)

        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 200, { 'Content-Type': 'application/json' })
        const responseBody = JSON.parse(res.end.firstCall.args[0] as string)
        assert.strictEqual(responseBody.SessionId, 'session-123')
        assert.strictEqual(responseBody.StreamUrl, 'wss://stream.example.com/session123')
        assert.strictEqual(responseBody.TokenValue, 'session-token-value')
    })

    it('returns 500 when createWorkspaceConnection fails', async function () {
        readMappingStub.resolves(validMapping)

        const createConnectionStub = sinon.stub(
            kubectlClientStubModule.KubectlClient.prototype,
            'createWorkspaceConnection'
        )
        createConnectionStub.rejects(new Error('K8s API timeout'))

        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 500)
        sinon.assert.calledWith(res.end, sinon.match('Failed to create workspace connection'))
    })

    it('returns 429 after exceeding retry limit', async function () {
        readMappingStub.resolves(validMapping)

        const createConnectionStub = sinon.stub(
            kubectlClientStubModule.KubectlClient.prototype,
            'createWorkspaceConnection'
        )
        createConnectionStub.rejects(new Error('K8s API timeout'))

        // Use a unique connection key for this test to avoid interference
        const testKey = 'retry-test:ns:cluster'
        const retryMapping: hyperpodMappingUtils.HyperpodMappings = {
            [testKey]: { ...validMapping['my-space:my-ns:my-cluster'] },
        }
        readMappingStub.resolves(retryMapping)

        // Exhaust the retry limit (maxRetries = 8)
        for (let i = 0; i < 9; i++) {
            const req = createMockRequest(`?connection_key=${testKey}`)
            await handleGetHyperpodSession(req, res as unknown as ServerResponse)
        }

        // The 9th call should hit the retry cap
        sinon.assert.calledWith(res.writeHead, 429)
        sinon.assert.calledWith(res.end, sinon.match('Too many retry attempts'))
    })

    it('returns 500 when readHyperpodMapping throws', async function () {
        readMappingStub.rejects(new Error('File system error'))
        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        sinon.assert.calledWith(res.writeHead, 500)
        sinon.assert.calledWith(res.end, sinon.match('Failed to read HyperPod connection mapping'))
    })

    it('constructs devSpace with correct workspace name from connection key', async function () {
        readMappingStub.resolves(validMapping)

        const createConnectionStub = sinon.stub(
            kubectlClientStubModule.KubectlClient.prototype,
            'createWorkspaceConnection'
        )
        createConnectionStub.resolves({
            type: 'vscode-remote',
            url: 'wss://stream.example.com',
            token: 'tok',
            sessionId: 'sid',
        })

        const req = createMockRequest('?connection_key=my-space:my-ns:my-cluster')
        await handleGetHyperpodSession(req, res as unknown as ServerResponse)

        const devSpaceArg = createConnectionStub.firstCall.args[0]
        assert.strictEqual(devSpaceArg.name, 'my-space')
        assert.strictEqual(devSpaceArg.namespace, 'my-ns')
        assert.strictEqual(devSpaceArg.cluster, 'my-cluster')
    })
})
