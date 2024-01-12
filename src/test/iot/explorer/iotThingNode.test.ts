/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotCertificate, IotClient } from '../../../shared/clients/iotClient'
import { Iot } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { IotThingCertNode } from '../../../iot/explorer/iotCertificateNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import sinon from 'sinon'

describe('IotThingNode', function () {
    const nextToken = 'nextToken'
    const maxResults = 250

    let iot: IotClient
    let config: TestSettings
    const thingName = 'thing'
    const thing = { name: thingName, arn: 'thingArn' }
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
        assert.ok(node instanceof IotThingCertNode, `Node ${node} should be a Certificate Node`)
        assert.deepStrictEqual((node as IotThingCertNode).certificate, expectedCert)
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
                certificates: [cert],
                nextToken: undefined,
            })
            iot.listThingCertificates = stub

            await config.getSection('aws').update('iot.maxItemsPerPage', maxResults)
            const node = new IotThingNode(thing, {} as IotThingFolderNode, iot, config)
            const [certNode, ...otherNodes] = await node.getChildren()

            assert(stub.calledOnceWithExactly({ thingName, nextToken: undefined, maxResults }))
            assertCertNode(certNode, expectedCert)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            const stub = sinon.stub().resolves({
                certificates: [cert],
                nextToken,
            })
            iot.listThingCertificates = stub

            await config.getSection('aws').update('iot.maxItemsPerPage', maxResults)
            const node = new IotThingNode(thing, {} as IotThingFolderNode, iot, config)
            const [certNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assert(stub.calledOnceWithExactly({ thingName, nextToken: undefined, maxResults }))
            assertCertNode(certNode, expectedCert)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
