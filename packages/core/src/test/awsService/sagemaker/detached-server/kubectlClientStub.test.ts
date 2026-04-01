/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import {
    KubectlClient,
    EksClusterInfo,
    HyperpodCluster,
} from '../../../../awsService/sagemaker/detached-server/kubectlClientStub'
import * as eksTokenGenerator from '../../../../shared/clients/eksTokenGenerator'
import { AwsCredentialIdentity } from '@aws-sdk/types'

describe('KubectlClient (stub)', function () {
    const testCredentials: AwsCredentialIdentity = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    }

    const eksCluster: EksClusterInfo = {
        name: 'test-eks-cluster',
        endpoint: 'https://eks.us-east-1.amazonaws.com',
        certificateAuthority: { data: 'dGVzdC1jYS1kYXRh' },
    }

    const hyperpodCluster: HyperpodCluster = {
        clusterName: 'test-hp-cluster',
        clusterArn: 'arn:aws:sagemaker:us-east-1:123456789012:cluster/test-hp-cluster',
        status: 'InService',
        regionCode: 'us-east-1',
    }

    let generateTokenStub: sinon.SinonStub

    beforeEach(function () {
        generateTokenStub = sinon.stub(eksTokenGenerator, 'generateEksToken').resolves({
            token: 'k8s-aws-v1.fake-token',
            expiresAt: new Date(Date.now() + 900_000),
        })
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('createForCluster', function () {
        it('creates a client and generates an initial token', async function () {
            await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            sinon.assert.calledOnce(generateTokenStub)
            sinon.assert.calledWith(generateTokenStub, 'test-eks-cluster', 'us-east-1', testCredentials)
        })

        it('skips initialization when eksCluster has no name', async function () {
            const noNameCluster: EksClusterInfo = { endpoint: 'https://eks.us-east-1.amazonaws.com' }
            await KubectlClient.createForCluster(noNameCluster, hyperpodCluster, testCredentials)

            sinon.assert.notCalled(generateTokenStub)
        })

        it('skips initialization when eksCluster has no endpoint', async function () {
            const noEndpointCluster: EksClusterInfo = { name: 'test-cluster' }
            await KubectlClient.createForCluster(noEndpointCluster, hyperpodCluster, testCredentials)

            sinon.assert.notCalled(generateTokenStub)
        })
    })

    describe('getEksCluster', function () {
        it('returns the eksCluster passed during creation', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)
            assert.deepStrictEqual(client.getEksCluster(), eksCluster)
        })
    })

    describe('getApi', function () {
        it('throws when client is not initialized (no name/endpoint)', async function () {
            const emptyCluster: EksClusterInfo = {}
            const client = await KubectlClient.createForCluster(emptyCluster, hyperpodCluster, testCredentials)

            assert.throws(() => (client as any).getApi(), /KubectlClient not initialized/)
        })
    })

    describe('token refresh', function () {
        it('refreshes token when expired', async function () {
            generateTokenStub.onFirstCall().resolves({
                token: 'k8s-aws-v1.initial-token',
                expiresAt: new Date(Date.now() - 1000), // already expired
            })
            generateTokenStub.onSecondCall().resolves({
                token: 'k8s-aws-v1.refreshed-token',
                expiresAt: new Date(Date.now() + 900_000),
            })

            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            // ensureValidToken is protected, call it via createWorkspaceConnection which calls it internally
            // Since k8sApi is initialized, this will attempt a k8s call and fail, but token refresh should happen first
            assert.strictEqual(generateTokenStub.callCount, 1, 'Initial token generated')

            // Force a token check by calling ensureValidToken through the protected accessor
            await (client as any).ensureValidToken()

            assert.strictEqual(generateTokenStub.callCount, 2, 'Token should be refreshed when expired')
        })

        it('does not refresh token when still valid', async function () {
            generateTokenStub.resolves({
                token: 'k8s-aws-v1.valid-token',
                expiresAt: new Date(Date.now() + 900_000), // 15 min from now
            })

            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)
            assert.strictEqual(generateTokenStub.callCount, 1)

            await (client as any).ensureValidToken()

            assert.strictEqual(generateTokenStub.callCount, 1, 'Token should not be refreshed when still valid')
        })

        it('refreshes token when within 1 minute of expiry', async function () {
            generateTokenStub.onFirstCall().resolves({
                token: 'k8s-aws-v1.expiring-soon',
                expiresAt: new Date(Date.now() + 30_000), // 30 seconds from now (within 1 min buffer)
            })
            generateTokenStub.onSecondCall().resolves({
                token: 'k8s-aws-v1.refreshed',
                expiresAt: new Date(Date.now() + 900_000),
            })

            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)
            await (client as any).ensureValidToken()

            assert.strictEqual(generateTokenStub.callCount, 2, 'Token should refresh when within buffer period')
        })

        it('works with credentials provider function', async function () {
            const provider = sinon.stub().resolves(testCredentials)

            await KubectlClient.createForCluster(eksCluster, hyperpodCluster, provider)

            sinon.assert.calledWith(generateTokenStub, 'test-eks-cluster', 'us-east-1', provider)
        })
    })
})
