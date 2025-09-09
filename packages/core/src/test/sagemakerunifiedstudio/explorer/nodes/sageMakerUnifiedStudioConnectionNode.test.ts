/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioConnectionNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioConnectionNode'
import { SageMakerUnifiedStudioConnectionParentNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioConnectionParentNode'
import { ConnectionType, ConnectionSummary } from '@aws-sdk/client-datazone'
import { getLogger } from '../../../../shared/logger/logger'

describe('SageMakerUnifiedStudioConnectionNode', function () {
    let connectionNode: SageMakerUnifiedStudioConnectionNode
    let mockParent: sinon.SinonStubbedInstance<SageMakerUnifiedStudioConnectionParentNode>

    const mockRedshiftConnection: ConnectionSummary = {
        connectionId: 'conn-1',
        name: 'Test Redshift Connection',
        type: ConnectionType.REDSHIFT,
        environmentId: 'env-1',
        domainId: 'domain-1',
        domainUnitId: 'unit-1',
        physicalEndpoints: [],
        props: {
            redshiftProperties: {
                jdbcUrl: 'jdbc:redshift://test-cluster:5439/testdb',
            },
        },
    }

    const mockSparkConnection: ConnectionSummary = {
        connectionId: 'conn-2',
        name: 'Test Spark Connection',
        type: ConnectionType.SPARK,
        environmentId: 'env-2',
        domainId: 'domain-2',
        domainUnitId: 'unit-2',
        physicalEndpoints: [],
        props: {
            sparkGlueProperties: {
                glueVersion: '4.0',
                workerType: 'G.1X',
                numberOfWorkers: 2,
                idleTimeout: 30,
            },
        },
    }

    beforeEach(function () {
        mockParent = {} as any
        sinon.stub(getLogger(), 'debug')
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties for Redshift connection', function () {
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, mockRedshiftConnection)

            assert.strictEqual(connectionNode.id, 'Test Redshift Connection')
            assert.strictEqual(connectionNode.resource, connectionNode)
            assert.strictEqual(connectionNode.contextValue, 'SageMakerUnifiedStudioConnectionNode')
        })

        it('creates instance with empty id when connection name is undefined', function () {
            const connectionWithoutName = { ...mockRedshiftConnection, name: undefined }
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, connectionWithoutName)

            assert.strictEqual(connectionNode.id, '')
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item for Redshift connection', async function () {
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, mockRedshiftConnection)

            const treeItem = await connectionNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Test Redshift Connection')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.strictEqual(treeItem.contextValue, 'SageMakerUnifiedStudioConnectionNode')
            assert.ok(treeItem.tooltip instanceof vscode.MarkdownString)
        })

        it('returns correct tree item for Spark connection', async function () {
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, mockSparkConnection)

            const treeItem = await connectionNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Test Spark Connection')
            assert.ok(treeItem.tooltip instanceof vscode.MarkdownString)
        })
    })

    describe('tooltip generation', function () {
        it('generates correct tooltip for Redshift connection', async function () {
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, mockRedshiftConnection)

            const treeItem = await connectionNode.getTreeItem()
            const tooltip = (treeItem.tooltip as vscode.MarkdownString).value

            assert(tooltip.includes('REDSHIFT'))
            assert(tooltip.includes('env-1'))
            assert(tooltip.includes('jdbc:redshift://test-cluster:5439/testdb'))
        })

        it('generates correct tooltip for Spark connection', async function () {
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, mockSparkConnection)

            const treeItem = await connectionNode.getTreeItem()
            const tooltip = (treeItem.tooltip as vscode.MarkdownString).value

            assert(tooltip.includes('SPARK'))
            assert(tooltip.includes('4.0'))
            assert(tooltip.includes('G.1X'))
            assert(tooltip.includes('2'))
            assert(tooltip.includes('30'))
        })

        it('generates empty tooltip for unknown connection type', async function () {
            const unknownConnection = { ...mockRedshiftConnection, type: 'UNKNOWN' as ConnectionType }
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, unknownConnection)

            const treeItem = await connectionNode.getTreeItem()
            const tooltip = (treeItem.tooltip as vscode.MarkdownString).value

            assert.strictEqual(tooltip, '')
        })
    })

    describe('getParent', function () {
        it('returns the parent node', function () {
            connectionNode = new SageMakerUnifiedStudioConnectionNode(mockParent as any, mockRedshiftConnection)

            const parent = connectionNode.getParent()

            assert.strictEqual(parent, mockParent)
        })
    })
})
