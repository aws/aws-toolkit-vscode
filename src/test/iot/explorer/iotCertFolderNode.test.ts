/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotCertificate, IotClient } from '../../../shared/clients/iotClient'
import { Certificate } from "@aws-sdk/client-iot";
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'
import { FakeWorkspace } from '../../shared/vscode/fakeWorkspace'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'

describe('IotCertFolderNode', function () {
    const nextMarker = 'nextToken'
    const pageSize = 250

    let iot: IotClient
    const cert: Certificate = {
        certificateId: 'cert',
        certificateArn: 'arn',
        status: 'ACTIVE',
        creationDate: new Date(0),
    }
    const expectedCert: IotCertificate = {
        id: 'cert',
        arn: 'arn',
        activeStatus: 'ACTIVE',
        creationDate: new Date(0),
    }

    function assertCertNode(node: AWSTreeNodeBase, expectedCert: IotCertificate): void {
        assert.ok(node instanceof IotCertWithPoliciesNode, `Node ${node} should be a Certificate Node`)
        assert.deepStrictEqual((node as IotCertWithPoliciesNode).certificate, expectedCert)
    }

    function assertMoreResultsNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof MoreResultsNode, `Node ${node} should be a More Results Node`)
    }

    beforeEach(function () {
        iot = mock()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            when(iot.listCertificates(deepEqual({ marker: undefined, pageSize }))).thenResolve({
                certificates: [cert],
                nextMarker: undefined,
            })
            when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 'iot.maxItemsPerPage', value: pageSize },
            })
            const node = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)), workspace)
            const [certNode, ...otherNodes] = await node.getChildren()

            assertCertNode(certNode, expectedCert)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            when(iot.listCertificates(deepEqual({ marker: undefined, pageSize }))).thenResolve({
                certificates: [cert],
                nextMarker,
            })
            when(iot.listPolicyTargets(deepEqual({ policyName: 'policy' }))).thenResolve([])

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 'iot.maxItemsPerPage', value: pageSize },
            })
            const node = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)), workspace)
            const [certNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assertCertNode(certNode, expectedCert)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
