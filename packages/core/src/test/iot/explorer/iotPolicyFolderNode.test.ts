/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient, IotPolicy } from '../../../shared/clients/iotClient'
import { Iot } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import sinon from 'sinon'

describe('IotPolicyFolderNode', function () {
    const nextMarker = 'nextMarker'
    const pageSize = 250

    let iot: IotClient
    let config: TestSettings
    const policy: Iot.Policy = { policyName: 'policy', policyArn: 'arn' }
    const expectedPolicy: IotPolicy = { name: 'policy', arn: 'arn' }

    function assertPolicyNode(node: AWSTreeNodeBase, expectedPolicy: IotPolicy): void {
        assert.ok(node instanceof IotPolicyWithVersionsNode, `Node ${node} should be a Policy Node`)
        assert.deepStrictEqual((node as IotPolicyWithVersionsNode).policy, expectedPolicy)
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
            const policiesStub = sinon.stub().resolves({
                policies: [policy],
                nextMarker: undefined,
            })
            iot.listPolicies = policiesStub
            const targetsStub = sinon.stub().resolves([])
            iot.listPolicyTargets = targetsStub

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)
            const node = new IotPolicyFolderNode(iot, new IotNode(iot), config)
            const [policyNode, ...otherNodes] = await node.getChildren()

            assert(policiesStub.calledOnceWithExactly({ marker: undefined, pageSize }))
            assert(targetsStub.calledOnceWithExactly({ policyName: 'policy' }))
            assertPolicyNode(policyNode, expectedPolicy)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            const policiesStub = sinon.stub().resolves({
                policies: [policy],
                nextMarker,
            })
            iot.listPolicies = policiesStub
            const targetsStub = sinon.stub().resolves([])
            iot.listPolicyTargets = targetsStub

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)
            const node = new IotPolicyFolderNode(iot, new IotNode(iot), config)
            const [policyNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assert(policiesStub.calledOnceWithExactly({ marker: undefined, pageSize }))
            assert(targetsStub.calledOnceWithExactly({ policyName: 'policy' }))
            assertPolicyNode(policyNode, expectedPolicy)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
