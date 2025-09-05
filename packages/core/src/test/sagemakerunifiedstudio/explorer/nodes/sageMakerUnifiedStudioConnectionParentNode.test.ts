/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioConnectionParentNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioConnectionParentNode'
import { SageMakerUnifiedStudioComputeNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioComputeNode'
import { SageMakerUnifiedStudioConnectionNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioConnectionNode'
import { DataZoneClient } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'

import { ConnectionType, ListConnectionsCommandOutput, ConnectionSummary } from '@aws-sdk/client-datazone'
import { getLogger } from '../../../../shared/logger/logger'

describe('SageMakerUnifiedStudioConnectionParentNode', function () {
    let connectionParentNode: SageMakerUnifiedStudioConnectionParentNode
    let mockComputeNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioComputeNode>

    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>

    const mockProject = {
        id: 'project-123',
        domainId: 'domain-123',
    }

    const mockConnectionsOutput: ListConnectionsCommandOutput = {
        items: [
            {
                connectionId: 'conn-1',
                name: 'Test Connection 1',
                type: ConnectionType.REDSHIFT,
                environmentId: 'env-1',
            } as ConnectionSummary,
            {
                connectionId: 'conn-2',
                name: 'Test Connection 2',
                type: ConnectionType.REDSHIFT,
                environmentId: 'env-2',
            } as ConnectionSummary,
        ],
        $metadata: {},
    }

    beforeEach(function () {
        // Create mock objects
        mockDataZoneClient = {
            fetchConnections: sinon.stub(),
        } as any

        mockComputeNode = {
            authProvider: {} as any,
            parent: {
                project: mockProject,
            } as any,
        } as any

        // Stub static methods
        sinon.stub(DataZoneClient, 'getInstance').resolves(mockDataZoneClient as any)
        sinon.stub(getLogger(), 'debug')

        connectionParentNode = new SageMakerUnifiedStudioConnectionParentNode(
            mockComputeNode as any,
            ConnectionType.REDSHIFT,
            'Data warehouse'
        )
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(connectionParentNode.id, 'Data warehouse')
            assert.strictEqual(connectionParentNode.resource, connectionParentNode)
            assert.strictEqual(connectionParentNode.contextValue, 'SageMakerUnifiedStudioConnectionParentNode')
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item', async function () {
            const treeItem = await connectionParentNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Data warehouse')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert.strictEqual(treeItem.contextValue, 'SageMakerUnifiedStudioConnectionParentNode')
        })
    })

    describe('getChildren', function () {
        it('returns connection nodes when connections exist', async function () {
            mockDataZoneClient.fetchConnections.resolves(mockConnectionsOutput)

            const children = await connectionParentNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert(children[0] instanceof SageMakerUnifiedStudioConnectionNode)
            assert(children[1] instanceof SageMakerUnifiedStudioConnectionNode)

            // Verify fetchConnections was called with correct parameters
            assert(
                mockDataZoneClient.fetchConnections.calledOnceWith(
                    mockProject.domainId,
                    mockProject.id,
                    ConnectionType.REDSHIFT
                )
            )
        })

        it('returns no connections node when no connections exist', async function () {
            const emptyOutput: ListConnectionsCommandOutput = { items: [], $metadata: {} }
            mockDataZoneClient.fetchConnections.resolves(emptyOutput)

            const children = await connectionParentNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusNoConnections')
            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, '[No connections found]')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
        })

        it('returns no connections node when connections items is undefined', async function () {
            const undefinedOutput: ListConnectionsCommandOutput = { items: undefined, $metadata: {} }
            mockDataZoneClient.fetchConnections.resolves(undefinedOutput)

            const children = await connectionParentNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusNoConnections')
        })

        it('handles missing project information gracefully', async function () {
            const nodeWithoutProject = new SageMakerUnifiedStudioConnectionParentNode(
                {
                    authProvider: {} as any,
                    parent: {
                        project: undefined,
                    } as any,
                } as any,
                ConnectionType.SPARK,
                'Data processing'
            )

            mockDataZoneClient.fetchConnections.resolves({ items: [], $metadata: {} })

            const children = await nodeWithoutProject.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusNoConnections')
            assert(mockDataZoneClient.fetchConnections.calledOnceWith(undefined, undefined, ConnectionType.SPARK))
        })
    })

    describe('getParent', function () {
        it('returns the parent compute node', function () {
            const parent = connectionParentNode.getParent()
            assert.strictEqual(parent, mockComputeNode)
        })
    })

    describe('error handling', function () {
        it('handles DataZoneClient.getInstance error', async function () {
            sinon.restore()
            sinon.stub(DataZoneClient, 'getInstance').rejects(new Error('Client error'))
            sinon.stub(getLogger(), 'debug')

            try {
                await connectionParentNode.getChildren()
                assert.fail('Expected error to be thrown')
            } catch (error) {
                assert.strictEqual((error as Error).message, 'Client error')
            }
        })

        it('handles fetchConnections error', async function () {
            mockDataZoneClient.fetchConnections.rejects(new Error('Fetch error'))

            try {
                await connectionParentNode.getChildren()
                assert.fail('Expected error to be thrown')
            } catch (error) {
                assert.strictEqual((error as Error).message, 'Fetch error')
            }
        })
    })

    describe('connections property', function () {
        it('sets connections property after getChildren call', async function () {
            mockDataZoneClient.fetchConnections.resolves(mockConnectionsOutput)

            await connectionParentNode.getChildren()

            assert.strictEqual(connectionParentNode.connections, mockConnectionsOutput)
        })
    })

    describe('different connection types', function () {
        it('works with SPARK connection type', async function () {
            const sparkNode = new SageMakerUnifiedStudioConnectionParentNode(
                mockComputeNode as any,
                ConnectionType.SPARK,
                'Spark connections'
            )

            const sparkOutput = {
                items: [
                    {
                        connectionId: 'spark-1',
                        name: 'Spark Connection',
                        type: ConnectionType.SPARK,
                        environmentId: 'env-spark',
                    } as ConnectionSummary,
                ],
                $metadata: {},
            }

            mockDataZoneClient.fetchConnections.resolves(sparkOutput)

            const children = await sparkNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert(
                mockDataZoneClient.fetchConnections.calledWith(
                    mockProject.domainId,
                    mockProject.id,
                    ConnectionType.SPARK
                )
            )
        })
    })
})
