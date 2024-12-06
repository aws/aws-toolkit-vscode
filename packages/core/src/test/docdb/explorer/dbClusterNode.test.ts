/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { DBCluster } from '@aws-sdk/client-docdb'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBInstanceNode } from '../../../docdb/explorer/dbInstanceNode'
import { DBInstance, DocumentDBClient } from '../../../shared/clients/docdbClient'

describe('DBClusterNode', function () {
    let mockClient: DocumentDBClient
    let parentNode: AWSTreeNodeBase

    beforeEach(() => {
        parentNode = {
            refresh: sinon.stub(),
        } as unknown as AWSTreeNodeBase

        mockClient = {
            listClusters: sinon.stub().resolves([{ DBClusterIdentifier: 'Cluster-1', Status: 'available' }]),
            listInstances: sinon.stub().resolves([]),
        } as Partial<DocumentDBClient> as DocumentDBClient

        DBClusterNode['globalPollingArns'].clear()
    })

    afterEach(() => {
        DBClusterNode['globalPollingArns'].clear()
    })

    const cluster: DBCluster = { DBClusterIdentifier: 'Cluster-1' }
    const instanceA: DBInstance = { DBInstanceIdentifier: 'Instance-A' }
    const instanceB: DBInstance = { DBInstanceIdentifier: 'Instance-B' }

    function assertInstanceNode(node: AWSTreeNodeBase, expectedInstance: DBInstance): void {
        assert.ok(node instanceof DBInstanceNode, `Node ${node} should be an Instance Node`)
        assert.deepStrictEqual((node as DBInstanceNode).instance, expectedInstance)
    }

    it('gets children', async function () {
        ;(mockClient.listInstances as sinon.SinonStub).resolves([instanceA, instanceB])
        const node = new DBClusterNode(parentNode, cluster, mockClient)
        const [firstInstanceNode, secondInstanceNode, ...otherNodes] = await node.getChildren()

        assertInstanceNode(firstInstanceNode, instanceA)
        assertInstanceNode(secondInstanceNode, instanceB)
        assert.strictEqual(otherNodes.length, 0)
    })

    it('returns false for available status', function () {
        const clusterStatus = { ...cluster, Status: 'available' }
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)
        const requiresPolling = node.isStatusRequiringPolling()

        assert.strictEqual(requiresPolling, false, 'isStatusRequiringPolling should return false for available status')
    })

    it('returns true for creating status', function () {
        const clusterStatus = { ...cluster, Status: 'creating' }
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)
        const requiresPolling = node.isStatusRequiringPolling()

        assert.strictEqual(requiresPolling, true, 'isStatusRequiringPolling should return true for creating status')
    })

    it('starts tracking changes when status requires polling', function () {
        const clusterStatus = { ...cluster, Status: 'creating' }
        const trackChangesSpy = sinon.spy(DBClusterNode.prototype, 'trackChanges')
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)
        const requiresPolling = node.isStatusRequiringPolling()

        assert.strictEqual(requiresPolling, true, 'isStatusRequiringPolling should return true for creating status')
        assert.ok(trackChangesSpy.calledOnce, 'trackChanges should be called when polling is required')
        assert.strictEqual(node.isPolling, true, 'Node should be in polling state')

        trackChangesSpy.restore()
    })

    it('does not start tracking changes when status does not require polling', function () {
        const clusterStatus = { ...cluster, Status: 'available' }
        const trackChangesSpy = sinon.spy(DBClusterNode.prototype, 'trackChanges')
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)
        const requiresPolling = node.isStatusRequiringPolling()

        assert.strictEqual(requiresPolling, false, 'isStatusRequiringPolling should return false for available status')
        assert.ok(trackChangesSpy.notCalled, 'trackChanges should not be called when polling is not required')
        assert.strictEqual(node.isPolling, false, 'Node should not be in polling state')

        trackChangesSpy.restore()
    })

    it('does not poll when status is available', function () {
        const clusterStatus = { ...cluster, Status: 'available' }
        const trackChangesSpy = sinon.spy(DBClusterNode.prototype, 'trackChanges')
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)
        const requiresPolling = node.isStatusRequiringPolling()

        assert.strictEqual(requiresPolling, false, 'isStatusRequiringPolling should return false for available status')
        assert.ok(trackChangesSpy.notCalled, 'trackChanges should not be called when polling is not required')
        assert.strictEqual(node.isPolling, false, 'Node should not be in polling state')

        trackChangesSpy.restore()
    })

    it('has isPolling set to false and getStatus returns available when status is available', async function () {
        const clusterStatus = { DBClusterIdentifier: 'Cluster-1', Status: 'available' }
        ;(mockClient.listClusters as sinon.SinonStub).resolves([clusterStatus])

        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)

        assert.strictEqual(node.isPolling, false, 'Node should not be in polling state')
        assert.strictEqual(node.status, 'available', 'getStatus should return available for the node')
    })

    it('handles missing clusters gracefully in getStatus', async function () {
        ;(mockClient.listClusters as sinon.SinonStub).resolves([])
        const node = new DBClusterNode(parentNode, cluster, mockClient)

        const status = await node.getStatus()
        assert.strictEqual(status, undefined, 'getStatus should return undefined when no cluster is found')
    })
})
