/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotClient, IotPolicy } from '../../../shared/clients/iotClient'
import { Iot } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'
import { IotPolicyCertNode } from '../../../iot/explorer/iotPolicyNode'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'

describe('IotCertificateNode', function () {
    const nextMarker = 'nextMarker'
    const pageSize = 250

    let iot: IotClient
    let config: TestSettings
    const certArn = 'certArn'
    const cert = { id: 'cert', arn: certArn, activeStatus: 'ACTIVE', creationDate: new Date(0) }
    const policy: Iot.Policy = { policyName: 'policy', policyArn: 'arn' }
    const expectedPolicy: IotPolicy = { name: 'policy', arn: 'arn' }

    function assertPolicyNode(node: AWSTreeNodeBase, expectedPolicy: IotPolicy): void {
        assert.ok(node instanceof IotPolicyCertNode, `Node ${node} should be a Policy Node`)
        assert.deepStrictEqual((node as IotPolicyCertNode).policy, expectedPolicy)
    }

    function assertMoreResultsNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof MoreResultsNode, `Node ${node} should be a More Results Node`)
    }

    beforeEach(function () {
        iot = mock()
        config = new TestSettings()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            when(iot.listPrincipalPolicies(deepEqual({ principal: certArn, marker: undefined, pageSize }))).thenResolve(
                {
                    policies: [policy],
                    nextMarker: undefined,
                }
            )

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)
            const node = new IotCertWithPoliciesNode(cert, {} as IotCertsFolderNode, instance(iot), undefined, config)
            const [policyNode, ...otherNodes] = await node.getChildren()

            assertPolicyNode(policyNode, expectedPolicy)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            when(iot.listPrincipalPolicies(deepEqual({ principal: certArn, marker: undefined, pageSize }))).thenResolve(
                {
                    policies: [policy],
                    nextMarker,
                }
            )

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)
            const node = new IotCertWithPoliciesNode(cert, {} as IotCertsFolderNode, instance(iot), undefined, config)
            const [policyNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assertPolicyNode(policyNode, expectedPolicy)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
