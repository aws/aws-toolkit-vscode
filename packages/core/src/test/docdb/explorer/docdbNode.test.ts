/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import assert from 'assert'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { DocumentDBClient } from '../../../shared/clients/docdbClient'
import { DBCluster } from '@aws-sdk/client-docdb'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { DBElasticClusterNode } from '../../../docdb/explorer/dbElasticClusterNode'

describe('DocumentDBNode', function () {
    const firstCluster: DBCluster = { DBClusterIdentifier: 'Cluster-1' }
    const secondCluster: DBCluster = { DBClusterIdentifier: 'Cluster-2' }
    const thirdCluster = { clusterName: 'Cluster-3', clusterArn: '', status: 'ACTIVE' }

    let client: DocumentDBClient

    function assertClusterNode(node: AWSTreeNodeBase, expectedCluster: DBCluster): void {
        assert.ok(node instanceof DBClusterNode, `Node ${node} should be a Cluster Node`)
        assert.deepStrictEqual((node as DBClusterNode).cluster, expectedCluster)
    }

    beforeEach(function () {
        client = {} as any as DocumentDBClient
    })

    it('gets children', async function () {
        client.listClusters = sinon.stub().resolves([firstCluster, secondCluster])
        client.listElasticClusters = sinon.stub().resolves([thirdCluster])
        client.listGlobalClusters = sinon.stub().resolves([])

        const node = new DocumentDBNode(client)
        const [firstClusterNode, secondClusterNode, thirdClusterNode, ...otherNodes] = await node.getChildren()

        assertClusterNode(firstClusterNode, firstCluster)
        assertClusterNode(secondClusterNode, secondCluster)
        assert.ok(
            thirdClusterNode instanceof DBElasticClusterNode,
            `Node ${thirdClusterNode} should be an Elastic Cluster Node`
        )
        assert.deepStrictEqual((thirdClusterNode as DBElasticClusterNode).cluster, thirdCluster)
        assert.strictEqual(otherNodes.length, 0)
    })
})
