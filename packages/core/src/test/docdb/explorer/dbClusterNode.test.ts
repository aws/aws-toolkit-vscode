/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { DBCluster, DBClusterMember } from '@aws-sdk/client-docdb'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBInstanceNode } from '../../../docdb/explorer/dbInstanceNode'

describe('DBClusterNode', function () {
    const cluster: DBCluster = {
        DBClusterIdentifier: 'Cluster-1',
        DBClusterMembers: [
            { DBInstanceIdentifier: 'Instance-1', IsClusterWriter: true },
            { DBInstanceIdentifier: 'Instance-2', IsClusterWriter: false },
        ],
    }

    function assertInstanceNode(node: AWSTreeNodeBase, expectedInstance: DBClusterMember): void {
        assert.ok(node instanceof DBInstanceNode, `Node ${node} should be a Instance Node`)
        assert.deepStrictEqual((node as DBInstanceNode).instance, expectedInstance)
    }

    it('gets children', async function () {
        const node = new DBClusterNode(cluster)
        const [firstInstanceNode, secondInstanceNode, ...otherNodes] = await node.getChildren()

        assertInstanceNode(firstInstanceNode, cluster.DBClusterMembers![0])
        assertInstanceNode(secondInstanceNode, cluster.DBClusterMembers![1])
        assert.strictEqual(otherNodes.length, 0)
    })
})
