/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotCertificate, IotClient } from '../../../shared/clients/iotClient'
import { Certificate } from "@aws-sdk/client-iot";
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'
import { FakeWorkspace } from '../../shared/vscode/fakeWorkspace'
import { IotThingCertNode } from '../../../iot/explorer/iotCertificateNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'

describe('IotThingNode', function () {
    const nextToken = 'nextToken'
    const maxResults = 250

    let iot: IotClient
    const thingName = 'thing'
    const thing = { name: thingName, arn: 'thingArn' }
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
        assert.ok(node instanceof IotThingCertNode, `Node ${node} should be a Certificate Node`)
        assert.deepStrictEqual((node as IotThingCertNode).certificate, expectedCert)
    }

    function assertMoreResultsNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof MoreResultsNode, `Node ${node} should be a More Results Node`)
    }

    beforeEach(function () {
        iot = mock()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            when(iot.listThingCertificates(deepEqual({ thingName, nextToken: undefined, maxResults }))).thenResolve({
                certificates: [cert],
                nextToken: undefined,
            })

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 'iot.maxItemsPerPage', value: maxResults },
            })
            const node = new IotThingNode(thing, {} as IotThingFolderNode, instance(iot), workspace)
            const [certNode, ...otherNodes] = await node.getChildren()

            assertCertNode(certNode, expectedCert)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            when(iot.listThingCertificates(deepEqual({ thingName, nextToken: undefined, maxResults }))).thenResolve({
                certificates: [cert],
                nextToken,
            })

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 'iot.maxItemsPerPage', value: maxResults },
            })
            const node = new IotThingNode(thing, {} as IotThingFolderNode, instance(iot), workspace)
            const [certNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assertCertNode(certNode, expectedCert)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
