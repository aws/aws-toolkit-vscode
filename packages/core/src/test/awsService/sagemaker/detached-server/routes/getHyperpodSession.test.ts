/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import assert from 'assert'
import { handleGetHyperpodSession } from '../../../../../awsService/sagemaker/detached-server/routes/getHyperpodSession'
import * as hyperpodMappingUtils from '../../../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'
import * as kubectlClientStubModule from '../../../../../awsService/sagemaker/detached-server/kubectlClientStub'

describe('handleGetHyperpodSession', () => {
    let readStub: sinon.SinonStub
    let resWriteHead: sinon.SinonSpy
    let resEnd: sinon.SinonSpy
    let res: Partial<http.ServerResponse>

    const validMapping: hyperpodMappingUtils.HyperpodMappings = {
        localCredential: {
            'my-space:my-ns:my-cluster': {
                namespace: 'my-ns',
                clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/my-cluster',
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
        },
    }

    beforeEach(() => {
        readStub = sinon.stub(hyperpodMappingUtils, 'readHyperpodMapping')
        resWriteHead = sinon.spy()
        resEnd = sinon.spy()
        res = { writeHead: resWriteHead, end: resEnd }
    })

    afterEach(() => {
        sinon.restore()
    })

    it('returns 400 when connection_key is missing', async () => {
        const req = { url: '/get_hyperpod_session' } as http.IncomingMessage
        await handleGetHyperpodSession(req, res as http.ServerResponse)

        assert(resWriteHead.calledWith(400))
        assert(resEnd.calledWith(sinon.match('Missing required query parameter')))
    })

    it('returns 404 when connection key not found', async () => {
        readStub.resolves({ localCredential: {} })
        const req = { url: '/get_hyperpod_session?connection_key=unknown:ns:cluster' } as http.IncomingMessage
        await handleGetHyperpodSession(req, res as http.ServerResponse)

        assert(resWriteHead.calledWith(404))
    })

    it('returns 401 when no credentials stored', async () => {
        readStub.resolves({
            localCredential: {
                'my-space:my-ns:my-cluster': {
                    ...validMapping.localCredential!['my-space:my-ns:my-cluster'],
                    credentials: undefined,
                },
            },
        })
        const req = { url: '/get_hyperpod_session?connection_key=my-space:my-ns:my-cluster' } as http.IncomingMessage
        await handleGetHyperpodSession(req, res as http.ServerResponse)

        assert(resWriteHead.calledWith(401))
    })

    it('returns 422 when EKS metadata is missing', async () => {
        readStub.resolves({
            localCredential: {
                'my-space:my-ns:my-cluster': {
                    ...validMapping.localCredential!['my-space:my-ns:my-cluster'],
                    endpoint: undefined,
                    eksClusterName: undefined,
                },
            },
        })
        const req = { url: '/get_hyperpod_session?connection_key=my-space:my-ns:my-cluster' } as http.IncomingMessage
        await handleGetHyperpodSession(req, res as http.ServerResponse)

        assert(resWriteHead.calledWith(422))
    })

    it('returns 200 with session on successful kubectl connection', async () => {
        readStub.resolves(validMapping)
        const createConnectionStub = sinon.stub(
            kubectlClientStubModule.KubectlClient.prototype,
            'createWorkspaceConnection'
        )
        createConnectionStub.resolves({
            type: 'vscode-remote',
            url: 'wss://stream.example.com/session123',
            token: 'session-token',
            sessionId: 'session-123',
        })

        const req = { url: '/get_hyperpod_session?connection_key=my-space:my-ns:my-cluster' } as http.IncomingMessage
        await handleGetHyperpodSession(req, res as http.ServerResponse)

        assert(resWriteHead.calledWith(200, { 'Content-Type': 'application/json' }))
        const body = JSON.parse(resEnd.firstCall.args[0])
        assert.strictEqual(body.SessionId, 'session-123')
        assert.strictEqual(body.StreamUrl, 'wss://stream.example.com/session123')
        assert.strictEqual(body.TokenValue, 'session-token')
    })

    it('returns 500 when kubectl connection fails', async () => {
        readStub.resolves(validMapping)
        const createConnectionStub = sinon.stub(
            kubectlClientStubModule.KubectlClient.prototype,
            'createWorkspaceConnection'
        )
        createConnectionStub.rejects(new Error('K8s API timeout'))

        const req = { url: '/get_hyperpod_session?connection_key=my-space:my-ns:my-cluster' } as http.IncomingMessage
        await handleGetHyperpodSession(req, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
        assert(resEnd.calledWith(sinon.match('Failed to create workspace connection')))
    })

    it('returns 500 when readHyperpodMapping throws', async () => {
        readStub.rejects(new Error('File system error'))
        const req = { url: '/get_hyperpod_session?connection_key=my-space:my-ns:my-cluster' } as http.IncomingMessage
        await handleGetHyperpodSession(req, res as http.ServerResponse)

        assert(resWriteHead.calledWith(500))
    })
})
