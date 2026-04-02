/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { Cluster } from '@aws-sdk/client-eks'
import { AwsCredentialIdentity } from '@aws-sdk/types'
import { KubectlClient } from '../../../shared/clients/kubectlClient'
import { HyperpodDevSpace, HyperpodCluster } from '../../../awsService/sagemaker/detached-server/hyperpodTypes'
import * as eksTokenGenerator from '../../../shared/clients/eksTokenGenerator'

describe('KubectlClient', function () {
    const testCredentials: AwsCredentialIdentity = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    }

    const eksCluster: Cluster = {
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

    const testDevSpace: HyperpodDevSpace = {
        name: 'test-space',
        namespace: 'test-ns',
        cluster: 'test-eks-cluster',
        group: 'workspace.jupyter.org',
        version: 'v1alpha1',
        plural: 'workspaces',
        status: 'Running',
        appType: 'code-editor',
        creator: 'test-user',
        accessType: 'Public',
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

    function stubGetApi(client: KubectlClient, apiMethods: Record<string, sinon.SinonStub>) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        sinon.stub(client as any, 'getApi').returns(apiMethods)
    }

    describe('createForCluster', function () {
        it('creates a client and generates an initial token', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            sinon.assert.calledOnce(generateTokenStub)
            assert.ok(client)
        })

        it('returns the EKS Cluster object via getEksCluster', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)
            const returned = client.getEksCluster()
            assert.strictEqual(returned.name, eksCluster.name)
            assert.strictEqual(returned.endpoint, eksCluster.endpoint)
        })
    })

    describe('getStatusFromConditions', function () {
        let client: KubectlClient

        beforeEach(async function () {
            client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)
        })

        function callGetStatus(conditions: any[] | undefined, desiredStatus?: string): string {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            return (client as any).getStatusFromConditions(conditions, desiredStatus) as string
        }

        it('returns Unknown when conditions is undefined', function () {
            assert.strictEqual(callGetStatus(undefined), 'Unknown')
        })

        it('returns Error when Degraded is true', function () {
            const conditions = [
                { type: 'Degraded', status: 'True' },
                { type: 'Available', status: 'True' },
            ]
            assert.strictEqual(callGetStatus(conditions), 'Error')
        })

        it('returns Starting when progressing and desiredStatus is Running', function () {
            const conditions = [
                { type: 'Available', status: 'False' },
                { type: 'Progressing', status: 'True' },
                { type: 'Stopped', status: 'False' },
            ]
            assert.strictEqual(callGetStatus(conditions, 'Running'), 'Starting')
        })

        it('returns Stopping when progressing and desiredStatus is Stopped', function () {
            const conditions = [
                { type: 'Available', status: 'False' },
                { type: 'Progressing', status: 'True' },
                { type: 'Stopped', status: 'False' },
            ]
            assert.strictEqual(callGetStatus(conditions, 'Stopped'), 'Stopping')
        })

        it('returns Running when available and not progressing or stopped', function () {
            const conditions = [
                { type: 'Available', status: 'True' },
                { type: 'Progressing', status: 'False' },
                { type: 'Stopped', status: 'False' },
            ]
            assert.strictEqual(callGetStatus(conditions), 'Running')
        })

        it('returns Stopped when not available, not progressing, and stopped', function () {
            const conditions = [
                { type: 'Available', status: 'False' },
                { type: 'Progressing', status: 'False' },
                { type: 'Stopped', status: 'True' },
            ]
            assert.strictEqual(callGetStatus(conditions), 'Stopped')
        })

        it('returns Unknown for unrecognized condition combinations', function () {
            const conditions = [
                { type: 'Available', status: 'False' },
                { type: 'Progressing', status: 'False' },
                { type: 'Stopped', status: 'False' },
            ]
            assert.strictEqual(callGetStatus(conditions), 'Unknown')
        })

        it('returns Unknown when conditions array is empty', function () {
            assert.strictEqual(callGetStatus([]), 'Unknown')
        })
    })

    describe('getSpacesForCluster', function () {
        it('returns mapped dev spaces from K8s API response', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            const mockResponse = {
                body: {
                    items: [
                        {
                            metadata: {
                                name: 'space-1',
                                namespace: 'ns-1',
                                annotations: { 'workspace.jupyter.org/created-by': 'user-a' },
                            },
                            spec: { desiredStatus: 'Running', appType: 'jupyterlab', accessType: 'Public' },
                            status: {
                                conditions: [
                                    { type: 'Available', status: 'True' },
                                    { type: 'Progressing', status: 'False' },
                                    { type: 'Stopped', status: 'False' },
                                ],
                            },
                        },
                    ],
                },
            }

            stubGetApi(client, {
                listClusterCustomObject: sinon.stub().resolves(mockResponse),
            })

            const spaces = await client.getSpacesForCluster(eksCluster)
            assert.strictEqual(spaces.length, 1)
            assert.strictEqual(spaces[0].name, 'space-1')
            assert.strictEqual(spaces[0].namespace, 'ns-1')
            assert.strictEqual(spaces[0].status, 'Running')
            assert.strictEqual(spaces[0].appType, 'jupyterlab')
            assert.strictEqual(spaces[0].creator, 'user-a')
        })

        it('returns empty array when API returns no items', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            stubGetApi(client, {
                listClusterCustomObject: sinon.stub().resolves({ body: {} }),
            })

            const spaces = await client.getSpacesForCluster(eksCluster)
            assert.deepStrictEqual(spaces, [])
        })

        it('returns empty array on 403 error', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            const error: any = new Error('Forbidden')
            error.statusCode = 403
            stubGetApi(client, {
                listClusterCustomObject: sinon.stub().rejects(error),
            })

            const spaces = await client.getSpacesForCluster(eksCluster)
            assert.deepStrictEqual(spaces, [])
        })
    })

    describe('getHyperpodSpaceStatus', function () {
        it('returns status from K8s API response', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            stubGetApi(client, {
                getNamespacedCustomObject: sinon.stub().resolves({
                    body: {
                        spec: { desiredStatus: 'Running' },
                        status: {
                            conditions: [
                                { type: 'Available', status: 'True' },
                                { type: 'Progressing', status: 'False' },
                                { type: 'Stopped', status: 'False' },
                            ],
                        },
                    },
                }),
            })

            const status = await client.getHyperpodSpaceStatus(testDevSpace)
            assert.strictEqual(status, 'Running')
        })

        it('throws on API error', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            stubGetApi(client, {
                getNamespacedCustomObject: sinon.stub().rejects(new Error('network error')),
            })

            await assert.rejects(
                client.getHyperpodSpaceStatus(testDevSpace),
                /Failed to get status for devSpace: test-space/
            )
        })
    })

    describe('patchDevSpaceStatus', function () {
        it('calls patchNamespacedCustomObject with correct params', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            const patchStub = sinon.stub().resolves({})
            stubGetApi(client, {
                patchNamespacedCustomObject: patchStub,
            })

            await client.patchDevSpaceStatus(testDevSpace, 'Stopped')

            sinon.assert.calledOnce(patchStub)
            const args = patchStub.firstCall.args
            assert.strictEqual(args[0], testDevSpace.group)
            assert.strictEqual(args[1], testDevSpace.version)
            assert.strictEqual(args[2], testDevSpace.namespace)
            assert.strictEqual(args[3], testDevSpace.plural)
            assert.strictEqual(args[4], testDevSpace.name)
            assert.deepStrictEqual(args[5], { spec: { desiredStatus: 'Stopped' } })
        })

        it('throws on API error', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            stubGetApi(client, {
                patchNamespacedCustomObject: sinon.stub().rejects(new Error('patch failed')),
            })

            await assert.rejects(
                client.patchDevSpaceStatus(testDevSpace, 'Running'),
                /Failed to update transitional status for devSpace test-space/
            )
        })
    })

    describe('createWorkspaceConnection', function () {
        it('returns connection result from base class', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            stubGetApi(client, {
                createNamespacedCustomObject: sinon.stub().resolves({
                    body: {
                        status: {
                            workspaceConnectionUrl: 'https://presigned.example.com',
                            workspaceConnectionType: 'vscode-remote',
                            tokenValue: 'tok-123',
                            sessionId: 'sess-456',
                        },
                    },
                }),
            })

            const result = await client.createWorkspaceConnection(testDevSpace)
            assert.strictEqual(result.url, 'https://presigned.example.com')
            assert.strictEqual(result.type, 'vscode-remote')
            assert.strictEqual(result.token, 'tok-123')
            assert.strictEqual(result.sessionId, 'sess-456')
        })

        it('throws when no URL is returned', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            stubGetApi(client, {
                createNamespacedCustomObject: sinon.stub().resolves({
                    body: { status: {} },
                }),
            })

            await assert.rejects(client.createWorkspaceConnection(testDevSpace), /No workspace connection URL returned/)
        })

        it('defaults token and sessionId to empty string when not in response', async function () {
            const client = await KubectlClient.createForCluster(eksCluster, hyperpodCluster, testCredentials)

            stubGetApi(client, {
                createNamespacedCustomObject: sinon.stub().resolves({
                    body: {
                        status: {
                            workspaceConnectionUrl: 'https://example.com',
                            workspaceConnectionType: 'vscode-remote',
                        },
                    },
                }),
            })

            const result = await client.createWorkspaceConnection(testDevSpace)
            assert.strictEqual(result.token, '')
            assert.strictEqual(result.sessionId, '')
        })
    })
})
