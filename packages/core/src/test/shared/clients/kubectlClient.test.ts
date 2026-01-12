/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import * as k8s from '@kubernetes/client-node'
import { KubectlClient, HyperpodDevSpace, HyperpodCluster } from '../../../shared/clients/kubectlClient'
import { SagemakerDevSpaceNode } from '../../../awsService/sagemaker/explorer/sagemakerDevSpaceNode'
import { Cluster } from '@aws-sdk/client-eks'
import { createMockK8sSetup, setupMockDevSpaceNode } from './kubectlTestHelpers'
import { IncomingMessage } from 'http'

describe('KubectlClient', function () {
    let client: KubectlClient
    let mockK8sApi: sinon.SinonStubbedInstance<k8s.CustomObjectsApi>
    let mockDevSpace: HyperpodDevSpace
    let mockHyperpodCluster: HyperpodCluster
    let mockDevSpaceNode: sinon.SinonStubbedInstance<SagemakerDevSpaceNode>
    let mockEksCluster: Cluster

    beforeEach(function () {
        const mockSetup = createMockK8sSetup()
        mockK8sApi = mockSetup.mockK8sApi
        mockDevSpace = mockSetup.mockDevSpace
        mockHyperpodCluster = mockSetup.mockHyperpodCluster

        mockEksCluster = {
            name: 'test-cluster',
            endpoint: 'https://test-endpoint.com',
            certificateAuthority: { data: 'test-cert-data' },
        }
        mockDevSpaceNode = sinon.createStubInstance(SagemakerDevSpaceNode)
        Object.defineProperty(mockDevSpaceNode, 'devSpace', {
            value: mockDevSpace,
            writable: false,
        })

        client = new KubectlClient(mockEksCluster, mockHyperpodCluster)
        ;(client as any).k8sApi = mockK8sApi
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('getHyperpodSpaceStatus', function () {
        it('should return Running status when available and not progressing', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: {
                    status: {
                        conditions: [
                            { type: 'Available', status: 'True' },
                            { type: 'Progressing', status: 'False' },
                            { type: 'Stopped', status: 'False' },
                        ],
                    },
                    spec: { desiredStatus: 'Running' },
                },
            }
            mockK8sApi.getNamespacedCustomObject.resolves(mockResponse)

            const status = await client.getHyperpodSpaceStatus(mockDevSpace)
            assert.strictEqual(status, 'Running')
        })

        it('should return Starting status when progressing with Running desired status', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: {
                    status: {
                        conditions: [
                            { type: 'Available', status: 'False' },
                            { type: 'Progressing', status: 'True' },
                        ],
                    },
                    spec: { desiredStatus: 'Running' },
                },
            }
            mockK8sApi.getNamespacedCustomObject.resolves(mockResponse)

            const status = await client.getHyperpodSpaceStatus(mockDevSpace)
            assert.strictEqual(status, 'Starting')
        })

        it('should return Error status when degraded', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: {
                    status: {
                        conditions: [{ type: 'Degraded', status: 'True' }],
                    },
                },
            }
            mockK8sApi.getNamespacedCustomObject.resolves(mockResponse)

            const status = await client.getHyperpodSpaceStatus(mockDevSpace)
            assert.strictEqual(status, 'Error')
        })

        it('should throw error when API call fails', async function () {
            mockK8sApi.getNamespacedCustomObject.rejects(new Error('API Error'))

            await assert.rejects(
                client.getHyperpodSpaceStatus(mockDevSpace),
                /Failed to get status for devSpace: test-space/
            )
        })
    })

    describe('patchDevSpaceStatus', function () {
        it('should patch devspace with Running status', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: {},
            }
            mockK8sApi.patchNamespacedCustomObject.resolves(mockResponse)

            await client.patchDevSpaceStatus(mockDevSpace, 'Running')

            sinon.assert.calledOnceWithExactly(
                mockK8sApi.patchNamespacedCustomObject,
                'sagemaker.aws.amazon.com',
                'v1',
                'test-namespace',
                'devspaces',
                'test-space',
                { spec: { desiredStatus: 'Running' } },
                undefined,
                undefined,
                undefined,
                { headers: { 'Content-Type': 'application/merge-patch+json' } }
            )
        })

        it('should throw error when patch fails', async function () {
            mockK8sApi.patchNamespacedCustomObject.rejects(new Error('Patch failed'))

            await assert.rejects(
                client.patchDevSpaceStatus(mockDevSpace, 'Stopped'),
                /Failed to update transitional status for devSpace test-space/
            )
        })
    })

    describe('createWorkspaceConnection', function () {
        it('should create workspace connection and return connection details', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: {
                    status: {
                        workspaceConnectionUrl: 'https://test-url.com',
                        workspaceConnectionType: 'vscode-remote',
                    },
                },
            }
            mockK8sApi.createNamespacedCustomObject.resolves(mockResponse)

            const result = await client.createWorkspaceConnection(mockDevSpace)

            assert.strictEqual(result.type, 'vscode-remote')
            assert.strictEqual(result.url, 'https://test-url.com')
        })

        it('should throw error when workspace connection creation fails', async function () {
            mockK8sApi.createNamespacedCustomObject.rejects(new Error('Creation failed'))

            await assert.rejects(
                client.createWorkspaceConnection(mockDevSpace),
                /Failed to create workspace connection/
            )
        })
    })

    describe('getSpacesForCluster', function () {
        it('should return mapped workspaces from Kubernetes API', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: {
                    items: [
                        {
                            metadata: {
                                name: 'test-workspace',
                                namespace: 'test-namespace',
                                annotations: { 'workspace.jupyter.org/created-by': 'test-user' },
                            },
                            spec: { appType: 'jupyterlab', accessType: 'Public', desiredStatus: 'Running' },
                            status: { conditions: [{ type: 'Available', status: 'True' }] },
                        },
                    ],
                },
            }
            mockK8sApi.listClusterCustomObject.resolves(mockResponse)

            const result = await client.getSpacesForCluster(mockEksCluster)

            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0].name, 'test-workspace')
            assert.strictEqual(result[0].namespace, 'test-namespace')
            assert.strictEqual(result[0].creator, 'test-user')
        })

        it('should handle 403 permission errors with user message', async function () {
            const error = new Error('Forbidden')
            ;(error as any).statusCode = 403
            mockK8sApi.listClusterCustomObject.rejects(error)

            const result = await client.getSpacesForCluster(mockEksCluster)

            assert.strictEqual(result.length, 0)
        })

        it('should return empty array when API returns no items', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: {},
            }
            mockK8sApi.listClusterCustomObject.resolves(mockResponse)

            const result = await client.getSpacesForCluster(mockEksCluster)

            assert.strictEqual(result.length, 0)
        })

        it('should return empty array when no spaces found', async function () {
            const mockResponse = {
                response: {} as IncomingMessage,
                body: { items: [] },
            }
            mockK8sApi.listClusterCustomObject.resolves(mockResponse)

            const result = await client.getSpacesForCluster(mockEksCluster)

            assert.strictEqual(result.length, 0)
        })
    })

    describe('startHyperpodDevSpace', function () {
        it('should patch status to Running and track pending node', async function () {
            const mockParent = setupMockDevSpaceNode(mockDevSpaceNode)
            mockK8sApi.patchNamespacedCustomObject.resolves({} as any)
            mockK8sApi.getNamespacedCustomObject.resolves({
                response: {} as IncomingMessage,
                body: { status: { conditions: [] } },
            })

            await client.startHyperpodDevSpace(mockDevSpaceNode as any)

            sinon.assert.calledWith(
                mockK8sApi.patchNamespacedCustomObject,
                mockDevSpace.group,
                mockDevSpace.version,
                mockDevSpace.namespace,
                mockDevSpace.plural,
                mockDevSpace.name,
                { spec: { desiredStatus: 'Running' } }
            )
            sinon.assert.calledWith(mockParent.trackPendingNode, 'test-key')
        })
    })

    describe('stopHyperpodDevSpace', function () {
        it('should patch status to Stopped and track pending node', async function () {
            const mockParent = setupMockDevSpaceNode(mockDevSpaceNode)
            mockK8sApi.patchNamespacedCustomObject.resolves({} as any)
            mockK8sApi.getNamespacedCustomObject.resolves({
                response: {} as IncomingMessage,
                body: { status: { conditions: [] } },
            })

            await client.stopHyperpodDevSpace(mockDevSpaceNode as any)

            sinon.assert.calledWith(
                mockK8sApi.patchNamespacedCustomObject,
                mockDevSpace.group,
                mockDevSpace.version,
                mockDevSpace.namespace,
                mockDevSpace.plural,
                mockDevSpace.name,
                { spec: { desiredStatus: 'Stopped' } }
            )
            sinon.assert.calledWith(mockParent.trackPendingNode, 'test-key')
        })
    })
})
