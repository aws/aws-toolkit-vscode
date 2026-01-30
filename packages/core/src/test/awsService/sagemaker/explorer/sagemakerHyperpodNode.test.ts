/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { SagemakerHyperpodNode } from '../../../../awsService/sagemaker/explorer/sagemakerHyperpodNode'
import { SagemakerDevSpaceNode } from '../../../../awsService/sagemaker/explorer/sagemakerDevSpaceNode'
import { KubectlClient, HyperpodCluster } from '../../../../shared/clients/kubectlClient'
import { SagemakerClient } from '../../../../shared/clients/sagemaker'

describe('SagemakerHyperpodNode', function () {
    let testNode: SagemakerHyperpodNode
    let mockDevSpaceNode: sinon.SinonStubbedInstance<SagemakerDevSpaceNode>
    let mockKubectlClient: sinon.SinonStubbedInstance<KubectlClient>
    let mockSagemakerClient: sinon.SinonStubbedInstance<SagemakerClient>
    let mockHyperpodCluster: HyperpodCluster
    const testRegion = 'us-east-1'

    beforeEach(function () {
        mockSagemakerClient = sinon.createStubInstance(SagemakerClient)
        // Mock the EKS client that will be returned
        const mockEksClient = { send: sinon.stub() }
        mockSagemakerClient.getEKSClient.returns(mockEksClient as any)

        testNode = new SagemakerHyperpodNode(testRegion, mockSagemakerClient as any)
        mockDevSpaceNode = sinon.createStubInstance(SagemakerDevSpaceNode)
        mockKubectlClient = sinon.createStubInstance(KubectlClient)
        mockHyperpodCluster = {
            clusterName: 'test-cluster',
            clusterArn: 'arn:aws:sagemaker:us-east-1:123456789012:cluster/test-cluster',
            status: 'InService',
            regionCode: testRegion,
        }

        mockDevSpaceNode.getDevSpaceKey.returns('test-cluster-test-namespace-test-space')
        mockDevSpaceNode.isPending.returns(false)
        mockDevSpaceNode.updateWorkspaceStatus.resolves()
        mockDevSpaceNode.refreshNode.resolves()
    })

    afterEach(function () {
        testNode.pollingSet.clear()
        testNode.pollingSet.clearTimer()
        sinon.restore()
    })

    describe('constructor', function () {
        it('should initialize with correct properties', function () {
            assert.strictEqual(testNode.regionCode, testRegion)
            assert.strictEqual(testNode.label, 'HyperPod')
            assert.ok(testNode.hyperpodDevSpaceNodes instanceof Map)
            assert.ok(testNode.kubectlClients instanceof Map)
            assert.ok(testNode.pollingSet)
        })
    })

    describe('getKubectlClient', function () {
        it('should return kubectl client for cluster', function () {
            const clusterName = 'test-cluster'
            testNode.kubectlClients.set(clusterName, mockKubectlClient as any)

            const client = testNode.getKubectlClient(clusterName)
            assert.strictEqual(client, mockKubectlClient)
        })
    })

    describe('trackPendingNode', function () {
        it('should add devspace key to polling set', function () {
            const devSpaceKey = 'test-cluster-test-namespace-test-space'

            testNode.trackPendingNode(devSpaceKey)

            assert.ok(testNode.pollingSet.has(devSpaceKey))
        })
    })

    describe('updatePendingNodes', function () {
        it('should update pending nodes and remove from polling when not pending', async function () {
            const devSpaceKey = 'test-cluster-test-namespace-test-space'
            testNode.hyperpodDevSpaceNodes.set(devSpaceKey, mockDevSpaceNode as any)
            testNode.pollingSet.add(devSpaceKey)

            mockDevSpaceNode.isPending.returns(false)

            await (testNode as any).updatePendingNodes()

            sinon.assert.calledOnce(mockDevSpaceNode.updateWorkspaceStatus)
            sinon.assert.calledOnce(mockDevSpaceNode.refreshNode)
            assert.ok(!testNode.pollingSet.has(devSpaceKey))
        })

        it('should keep pending nodes in polling set', async function () {
            const devSpaceKey = 'test-cluster-test-namespace-test-space'
            testNode.hyperpodDevSpaceNodes.set(devSpaceKey, mockDevSpaceNode as any)
            testNode.pollingSet.add(devSpaceKey)

            mockDevSpaceNode.isPending.returns(true)

            await (testNode as any).updatePendingNodes()

            sinon.assert.calledOnce(mockDevSpaceNode.updateWorkspaceStatus)
            sinon.assert.notCalled(mockDevSpaceNode.refreshNode)
            assert.ok(testNode.pollingSet.has(devSpaceKey))
        })

        it('should throw error when devspace not found in map', async function () {
            const devSpaceKey = 'missing-key'
            testNode.pollingSet.add(devSpaceKey)

            await assert.rejects(
                (testNode as any).updatePendingNodes(),
                /Devspace missing-key from polling set not found/
            )
        })
    })

    describe('listSpaces', function () {
        it('should discover spaces across multiple clusters', async function () {
            const mockClusters = [
                {
                    clusterName: 'cluster1',
                    clusterArn: 'arn:aws:sagemaker:us-east-1:123:cluster/cluster1',
                    status: 'InService',
                    eksClusterName: 'eks1',
                    regionCode: testRegion,
                },
            ]
            mockSagemakerClient.listHyperpodClusters.resolves(mockClusters)

            const mockEksResponse = { cluster: { name: 'eks1', endpoint: 'https://test.com' } }
            ;(testNode.eksClient as any).send.resolves(mockEksResponse)

            const mockKubectl = { getSpacesForCluster: sinon.stub().resolves([]) }
            testNode.kubectlClients.set('cluster1', mockKubectl as any)

            const result = await testNode.listSpaces()

            assert.ok(result instanceof Map)
            sinon.assert.calledOnce(mockSagemakerClient.listHyperpodClusters)
        })

        it('should handle clusters without EKS integration', async function () {
            const mockClusters = [
                {
                    clusterName: 'cluster1',
                    clusterArn: 'arn:aws:sagemaker:us-east-1:123:cluster/cluster1',
                    status: 'InService',
                    regionCode: testRegion,
                },
            ] // No eksClusterName
            mockSagemakerClient.listHyperpodClusters.resolves(mockClusters)

            const result = await testNode.listSpaces()

            assert.strictEqual(result.size, 0)
        })

        it('should handle kubectl client creation errors', async function () {
            mockSagemakerClient.listHyperpodClusters.rejects(new Error('API Error'))

            await assert.rejects(testNode.listSpaces(), /No workspaces listed/)
        })
    })

    describe('updateChildren', function () {
        it('should filter spaces based on selected cluster namespaces', async function () {
            const mockDevSpace = {
                name: 'test-space',
                namespace: 'test-namespace',
                cluster: 'test-cluster', // This is the key field needed
                environment: 'test-env',
                application: 'test-app',
                group: 'test-group',
                version: 'v1',
                plural: 'spaces',
                status: 'Running',
                appType: 'jupyterlab',
                creator: 'test-user',
                accessType: 'Public',
            }
            const mockSpaces = new Map([
                [
                    'key1',
                    {
                        cluster: mockHyperpodCluster,
                        devSpace: mockDevSpace,
                    },
                ],
            ])
            sinon.stub(testNode, 'listSpaces').resolves(mockSpaces)
            sinon.stub(testNode, 'getSelectedClusterNamespaces').resolves(new Set(['test-cluster-test-namespace']))
            const stsStub = sinon.stub((testNode as any).stsClient, 'getCallerIdentity').resolves({ Arn: 'test-arn' })

            await testNode.updateChildren()

            assert.ok(testNode.hyperpodDevSpaceNodes instanceof Map)
            stsStub.restore()
        })

        it('should handle caller identity retrieval', async function () {
            sinon.stub(testNode, 'listSpaces').resolves(new Map())
            sinon.stub(testNode, 'getSelectedClusterNamespaces').resolves(new Set())
            const stsStub = sinon.stub((testNode as any).stsClient, 'getCallerIdentity').resolves({ Arn: 'test-arn' })

            await testNode.updateChildren()

            sinon.assert.calledOnce(stsStub)
            stsStub.restore()
        })
    })

    describe('getSelectedClusterNamespaces', function () {
        it('should return defaults when no cache exists', async function () {
            sinon.stub(testNode, 'getDefaultSelectedClusterNamespaces').resolves(['default-selection'])
            ;(testNode as any).callerIdentity = { Arn: 'test-arn' }

            const result = await testNode.getSelectedClusterNamespaces()

            assert.ok(result.has('default-selection'))
        })
    })
})
