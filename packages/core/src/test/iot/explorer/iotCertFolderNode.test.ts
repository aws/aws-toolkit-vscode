/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotCertificate, IotClient } from '../../../shared/clients/iotClient'
import { Iot } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import sinon from 'sinon'

describe('IotCertFolderNode', function () {
    const nextMarker = 'nextToken'
    const pageSize = 250

    let iot: IotClient
    let config: TestSettings

    const cert: Iot.Certificate = {
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
        iot = {} as any as IotClient
        config = new TestSettings()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            const listStub = sinon.stub().resolves({
                certificates: [cert],
                nextMarker: undefined,
            })
            iot.listCertificates = listStub
            const thingsStub = sinon.stub().resolves([])
            iot.listThingsForCert = thingsStub

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)

            const node = new IotCertsFolderNode(iot, new IotNode(iot), config)
            const [certNode, ...otherNodes] = await node.getChildren()

            assert(listStub.calledOnceWithExactly({ marker: undefined, pageSize }))
            assert(thingsStub.calledOnceWithExactly({ principal: 'arn' }))
            assertCertNode(certNode, expectedCert)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            const listStub = sinon.stub().resolves({
                certificates: [cert],
                nextMarker,
            })
            iot.listCertificates = listStub
            const thingsStub = sinon.stub().resolves([])
            iot.listThingsForCert = thingsStub
            const targetsStub = sinon.stub().resolves([])
            iot.listPolicyTargets = targetsStub

            await config.getSection('aws').update('iot.maxItemsPerPage', pageSize)
            const node = new IotCertsFolderNode(iot, new IotNode(iot), config)
            const [certNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assert(listStub.calledOnceWithExactly({ marker: undefined, pageSize }))
            assertCertNode(certNode, expectedCert)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
