/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { IotClient, IotPolicy } from '../../../shared/clients/iotClient'
import { Iot } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import sinon from 'sinon'

describe('IotPolicyNode', function () {
    let iot: IotClient
    let config: TestSettings
    const policyName = 'policy'
    const expectedPolicy: IotPolicy = { name: policyName, arn: 'arn' }
    const policyVersion: Iot.PolicyVersion = { versionId: 'V1', isDefaultVersion: true }

    function assertPolicyVersionNode(
        node: AWSTreeNodeBase,
        expectedPolicy: IotPolicy,
        expectedVersion: Iot.PolicyVersion
    ): void {
        assert.ok(node instanceof IotPolicyVersionNode, `Node ${node} should be a Policy Version Node`)
        assert.deepStrictEqual((node as IotPolicyVersionNode).version, expectedVersion)
        assert.deepStrictEqual((node as IotPolicyVersionNode).policy, expectedPolicy)
    }

    beforeEach(function () {
        iot = {} as any as IotClient
        config = new TestSettings()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            const versions = [{ versionId: 'V1', isDefaultVersion: true }]
            const stub = sinon.stub().returns(asyncGenerator<Iot.PolicyVersion>(versions))
            iot.listPolicyVersions = stub
            const node = new IotPolicyWithVersionsNode(
                expectedPolicy,
                {} as IotPolicyFolderNode,
                iot,
                undefined,
                config
            )
            const [policyVersionNode, ...otherNodes] = await node.getChildren()

            assert(stub.calledOnceWithExactly({ policyName }))
            assertPolicyVersionNode(policyVersionNode, expectedPolicy, policyVersion)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
