/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CloudWatchLogs } from 'aws-sdk'
import * as sinon from 'sinon'
import { CONTEXT_VALUE_CLOUDWATCH_LOG, LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'
import { CloudWatchLogsNode } from '../../../cloudWatchLogs/explorer/cloudWatchLogsNode'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import { asyncGenerator } from '../../utilities/collectionUtils'
import {
    assertNodeListOnlyContainsErrorNode,
    assertNodeListOnlyContainsPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'

const FAKE_REGION_CODE = 'someregioncode'
const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('CloudWatchLogsNode', () => {
    let sandbox: sinon.SinonSandbox
    let testNode: CloudWatchLogsNode

    // Mocked Lambda Client returns Log Groups for anything listed in logGroupNames
    let logGroupNames: string[]

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        logGroupNames = ['group1', 'group2']

        initializeClientBuilders()

        testNode = new CloudWatchLogsNode(FAKE_REGION_CODE)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('returns placeholder node if no children are present', async () => {
        logGroupNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
    })

    it('has LogGroupNode child nodes', async () => {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, logGroupNames.length, 'Unexpected child count')

        childNodes.forEach(node => assert.ok(node instanceof LogGroupNode, 'Expected child node to be LogGroupNode'))
    })

    it('has child nodes with CloudWatch Log contextValue', async () => {
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                CONTEXT_VALUE_CLOUDWATCH_LOG,
                'expected the node to have a CloudWatch Log contextValue'
            )
        )
    })

    it('sorts child nodes', async () => {
        logGroupNames = UNSORTED_TEXT

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, SORTED_TEXT, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async () => {
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update Children error!')
        })

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })

    function initializeClientBuilders() {
        const cloudWatchLogsClient = {
            describeLogGroups: sandbox.stub().callsFake(() => {
                return asyncGenerator<CloudWatchLogs.LogGroup>(
                    logGroupNames.map<CloudWatchLogs.LogGroup>(name => {
                        return {
                            logGroupName: name,
                        }
                    })
                )
            }),
        }

        const clientBuilder = {
            createCloudWatchLogsClient: sandbox.stub().returns(cloudWatchLogsClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})
