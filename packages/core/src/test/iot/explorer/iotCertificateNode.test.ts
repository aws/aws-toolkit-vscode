/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotClient, IotPolicy } from '../../../shared/clients/iotClient'
import { Iot } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { IotPolicyCertNode } from '../../../iot/explorer/iotPolicyNode'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import sinon from 'sinon'

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
        iot = {} as any as IotClient
        config = new TestSettings()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            const stub = sinon.stub().resolves({
                policies: [policy],
                nextMarker: undefined,
            })
            iot.listPrincipalPolicies = stub

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)
            const node = new IotCertWithPoliciesNode(cert, {} as IotCertsFolderNode, iot, undefined, config)
            const [policyNode, ...otherNodes] = await node.getChildren()

            assertPolicyNode(policyNode, expectedPolicy)
            assert(stub.calledOnceWithExactly({ principal: certArn, marker: undefined, pageSize }))
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            const stub = sinon.stub().resolves({
                policies: [policy],
                nextMarker,
            })
            iot.listPrincipalPolicies = stub

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)
            const node = new IotCertWithPoliciesNode(cert, {} as IotCertsFolderNode, iot, undefined, config)
            const [policyNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assert(stub.calledOnceWithExactly({ principal: certArn, marker: undefined, pageSize }))
            assertPolicyNode(policyNode, expectedPolicy)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
