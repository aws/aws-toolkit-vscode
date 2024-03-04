/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CloudWatchLogs } from 'aws-sdk'
import * as os from 'os'
import { LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'

describe('LogGroupNode', function () {
    let testNode: LogGroupNode
    let fakeLogGroup: CloudWatchLogs.LogGroup

    before(function () {
        fakeLogGroup = {
            logGroupName: "it'sBig/it'sHeavy/it'sWood",
            arn: "it'sBetterThanBadIt'sGood",
        }

        testNode = new LogGroupNode('someregioncode', fakeLogGroup)
    })

    it('instantiates without issue', async function () {
        assert.ok(testNode)
    })

    it('initializes the region code', async function () {
        assert.strictEqual(testNode.regionCode, 'someregioncode')
    })

    it('initializes the label', async function () {
        assert.strictEqual(testNode.label, fakeLogGroup.logGroupName)
    })

    it('initializes the functionName', async function () {
        assert.strictEqual(testNode.name, fakeLogGroup.logGroupName)
    })

    it('initializes the tooltip', async function () {
        assert.strictEqual(testNode.tooltip, `${fakeLogGroup.logGroupName}${os.EOL}${fakeLogGroup.arn}`)
    })

    it('has no children', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected node to have no children')
    })
})
