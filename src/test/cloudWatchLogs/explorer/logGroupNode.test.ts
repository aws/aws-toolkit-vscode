/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CloudWatchLogs } from 'aws-sdk'
import * as os from 'os'
import { LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'
import { ext } from '../../../shared/extensionGlobals'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'

describe('LogGroupNode', function () {
    const parentNode = new TestAWSTreeNode('test node')
    let testNode: LogGroupNode
    let fakeLogGroup: CloudWatchLogs.LogGroup

    before(async function () {
        setupTestIconPaths()
        fakeLogGroup = {
            logGroupName: "it'sBig/it'sHeavy/it'sWood",
            arn: "it'sBetterThanBadIt'sGood",
        }

        testNode = new LogGroupNode(parentNode, 'someregioncode', fakeLogGroup)
    })

    after(async function () {
        clearTestIconPaths()
    })

    it('instantiates without issue', async function () {
        assert.ok(testNode)
    })

    it('initializes the parent node', async function () {
        assert.strictEqual(testNode.parent, parentNode, 'unexpected parent node')
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

    it('initializes the icon', async function () {
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.cloudWatchLogGroup, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.cloudWatchLogGroup, 'Unexpected light icon path')
    })

    it('has no children', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected node to have no children')
    })
})
