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
    })

    const cluster: DBCluster = { DBClusterIdentifier: 'Cluster-1' }
    const instanceA: DBInstance = { DBInstanceIdentifier: 'Instance-A' }
    const instanceB: DBInstance = { DBInstanceIdentifier: 'Instance-B' }

    function assertInstanceNode(node: AWSTreeNodeBase, expectedInstance: DBInstance): void {
        assert.ok(node instanceof DBInstanceNode, `Node ${node} should be a Instance Node`)
        assert.deepStrictEqual((node as DBInstanceNode).instance, expectedInstance)
    }

    it('gets children', async function () {
        mockClient.listInstances = sinon.stub().resolves([instanceA, instanceB])
        const node = new DBClusterNode(cluster, mockClient)
        const [firstInstanceNode, secondInstanceNode, ...otherNodes] = await node.getChildren()

        assertInstanceNode(firstInstanceNode, instanceA)
        assertInstanceNode(secondInstanceNode, instanceB)
        assert.strictEqual(otherNodes.length, 0)
    })
})
