/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { contextValueCloudwatchLog, LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'
import { CloudWatchLogsNode } from '../../../cloudWatchLogs/explorer/cloudWatchLogsNode'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { DefaultCloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { stub } from '../../utilities/stubber'

const fakeRegionCode = 'someregioncode'
const unsortedText = ['zebra', 'Antelope', 'aardvark', 'elephant']
const sortedText = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('CloudWatchLogsNode', function () {
    let testNode: CloudWatchLogsNode

    // Mocked Lambda Client returns Log Groups for anything listed in logGroupNames
    let logGroupNames: string[]

    function createClient() {
        const client = stub(DefaultCloudWatchLogsClient, { regionCode: fakeRegionCode })
        client.describeLogGroups.callsFake(() => asyncGenerator(logGroupNames.map(name => ({ logGroupName: name }))))

        return client
    }

    beforeEach(function () {
        logGroupNames = ['group1', 'group2']
        testNode = new CloudWatchLogsNode(fakeRegionCode, createClient())
    })

    it('returns placeholder node if no children are present', async function () {
        logGroupNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has LogGroupNode child nodes', async function () {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, logGroupNames.length, 'Unexpected child count')

        childNodes.forEach(node => assert.ok(node instanceof LogGroupNode, 'Expected child node to be LogGroupNode'))
    })

    it('has child nodes with CloudWatch Log contextValue', async function () {
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                contextValueCloudwatchLog,
                'expected the node to have a CloudWatch Log contextValue'
            )
        )
    })

    it('sorts child nodes', async function () {
        logGroupNames = unsortedText

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, sortedText, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createClient()
        client.describeLogGroups.throws(new Error())

        const node = new CloudWatchLogsNode(fakeRegionCode, client)
        assertNodeListOnlyHasErrorNode(await node.getChildren())
    })
})
