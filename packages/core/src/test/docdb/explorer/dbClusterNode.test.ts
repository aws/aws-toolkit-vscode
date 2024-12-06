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
    beforeEach(() => {
        mockClient = {} as DocumentDBClient
        DBClusterNode['globalPollingArns'].clear()
    })

    afterEach(() => {
        DBClusterNode['globalPollingArns'].clear()
    })

    const parentNode = {} as AWSTreeNodeBase
    const cluster: DBCluster = { DBClusterIdentifier: 'Cluster-1' }
    const instanceA: DBInstance = { DBInstanceIdentifier: 'Instance-A' }
    const instanceB: DBInstance = { DBInstanceIdentifier: 'Instance-B' }

    function assertInstanceNode(node: AWSTreeNodeBase, expectedInstance: DBInstance): void {
        assert.ok(node instanceof DBInstanceNode, `Node ${node} should be a Instance Node`)
        assert.deepStrictEqual((node as DBInstanceNode).instance, expectedInstance)
    }

    it('gets children', async function () {
        mockClient.listInstances = sinon.stub().resolves([instanceA, instanceB])
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

        // Initialize the node with a status that requires polling
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)

        // Check the result of isStatusRequiringPolling
        const requiresPolling = node.isStatusRequiringPolling()
        assert.strictEqual(requiresPolling, true, 'isStatusRequiringPolling should return true for creating status')

        // Assert that trackChanges was called
        assert.ok(trackChangesSpy.calledOnce, 'trackChanges should be called when polling is required')

        // Verify the node is in the polling state
        assert.strictEqual(node.isPolling, true, 'Node should be in polling state')

        trackChangesSpy.restore()
    })

    it('does not start tracking changes when status does not require polling', function () {
        const clusterStatus = { ...cluster, Status: 'available' }

        const trackChangesSpy = sinon.spy(DBClusterNode.prototype, 'trackChanges')

        // Initialize the node with a status that does not require polling
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)

        // Check the result of isStatusRequiringPolling
        const requiresPolling = node.isStatusRequiringPolling()
        assert.strictEqual(requiresPolling, false, 'isStatusRequiringPolling should return false for available status')

        // Assert that trackChanges was not called
        assert.ok(trackChangesSpy.notCalled, 'trackChanges should not be called when polling is not required')

        // Verify the node is not in the polling state
        assert.strictEqual(node.isPolling, false, 'Node should not be in polling state')

        trackChangesSpy.restore()
    })

    it('does not polling when status is available', function () {
        const clusterStatus = { ...cluster, Status: 'available' }

        const trackChangesSpy = sinon.spy(DBClusterNode.prototype, 'trackChanges')

        // Initialize the node with a status that does not require polling
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)

        // Check the result of isStatusRequiringPolling
        const requiresPolling = node.isStatusRequiringPolling()
        assert.strictEqual(requiresPolling, false, 'isStatusRequiringPolling should return false for available status')

        // Assert that trackChanges was not called
        assert.ok(trackChangesSpy.notCalled, 'trackChanges should not be called when polling is not required')

        // Verify the node is not in the polling state
        assert.strictEqual(node.isPolling, false, 'Node should not be in polling state')

        trackChangesSpy.restore()
    })

    it('has isPolling set to false and getStatus returns available when status is available', async function () {
        const clusterStatus = { ...cluster, Status: 'available' }

        // Mock the DocumentDB client to return the status
        mockClient.listClusters = sinon.stub().resolves([clusterStatus])

        // Initialize the node with a status of 'available'
        const node = new DBClusterNode(parentNode, clusterStatus, mockClient)

        // Verify the node is not in the polling state
        assert.strictEqual(node.isPolling, false, 'Node should not be in polling state')

        // Get the status from the node and verify it is 'available'
        assert.strictEqual(node.status, 'available', 'getStatus should return available for the node')
    })
})
