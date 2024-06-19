/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { ApiGatewayNode } from '../../../apigateway/explorer/apiGatewayNodes'
import { RestApiNode } from '../../../apigateway/explorer/apiNodes'
import { DefaultApiGatewayClient } from '../../../shared/clients/apiGatewayClient'
import { stub } from '../../utilities/stubber'

const fakePartitionId = 'aws'
const fakeRegionCode = 'someregioncode'
const unsortedText = [
    { name: 'zebra', id: "it's zee not zed" },
    { name: 'zebra', id: "it's actually zed" },
    { name: 'Antelope', id: 'anti-antelope' },
    { name: 'aardvark', id: 'a-a-r-d-vark' },
    { name: 'elephant', id: 'trunk capacity' },
]
const sortedText = [
    'aardvark (a-a-r-d-vark)',
    'Antelope (anti-antelope)',
    'elephant (trunk capacity)',
    "zebra (it's actually zed)",
    "zebra (it's zee not zed)",
]

describe('ApiGatewayNode', function () {
    let testNode: ApiGatewayNode

    let apiNames: { name: string; id: string }[]

    function createClient() {
        const client = stub(DefaultApiGatewayClient, { regionCode: fakeRegionCode })
        client.listApis.callsFake(() => asyncGenerator(apiNames))

        return client
    }

    beforeEach(function () {
        apiNames = [
            { name: 'api1', id: '11111' },
            { name: 'api2', id: '22222' },
        ]

        testNode = new ApiGatewayNode(fakePartitionId, fakeRegionCode, createClient())
    })

    it('returns placeholder node if no children are present', async function () {
        apiNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has RestApi child nodes', async function () {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, apiNames.length, 'Unexpected child count')

        childNodes.forEach(node => assert.ok(node instanceof RestApiNode, 'Expected child node to be RestApiNode'))
    })

    it('sorts child nodes', async function () {
        apiNames = unsortedText

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, sortedText, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createClient()
        client.listApis.throws(new Error())

        const node = new ApiGatewayNode(fakePartitionId, fakeRegionCode, client)
        assertNodeListOnlyHasErrorNode(await node.getChildren())
    })
})
