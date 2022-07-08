/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CONTEXT_VALUE_CLOUDWATCH_LOG, LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'
import { CloudWatchLogsNode } from '../../../cloudWatchLogs/explorer/cloudWatchLogsNode'
import { asyncGenerator } from '../../utilities/collectionUtils'
import {
    assertNodeListOnlyContainsErrorNode,
    assertNodeListOnlyContainsPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { DefaultCloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { stub } from '../../utilities/stubber'

const FAKE_REGION_CODE = 'someregioncode'
const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('CloudWatchLogsNode', function () {
    let testNode: CloudWatchLogsNode

    // Mocked Lambda Client returns Log Groups for anything listed in logGroupNames
    let logGroupNames: string[]

    function createClient() {
        const client = stub(DefaultCloudWatchLogsClient, { regionCode: FAKE_REGION_CODE })
        client.describeLogGroups.callsFake(() => asyncGenerator(logGroupNames.map(name => ({ logGroupName: name }))))

        return client
    }

    beforeEach(function () {
        logGroupNames = ['group1', 'group2']
        testNode = new CloudWatchLogsNode(FAKE_REGION_CODE, createClient())
    })

    it('returns placeholder node if no children are present', async function () {
        logGroupNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
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
                CONTEXT_VALUE_CLOUDWATCH_LOG,
                'expected the node to have a CloudWatch Log contextValue'
            )
        )
    })

    it('sorts child nodes', async function () {
        logGroupNames = UNSORTED_TEXT

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, SORTED_TEXT, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createClient()
        client.describeLogGroups.throws(new Error())

        const node = new CloudWatchLogsNode(FAKE_REGION_CODE, client)
        assertNodeListOnlyContainsErrorNode(await node.getChildren())
    })
})
