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

describe('LogGroupNode', () => {
    const parentNode = new TestAWSTreeNode('test node')
    let testNode: LogGroupNode
    let fakeLogGroup: CloudWatchLogs.LogGroup

    before(async () => {
        setupTestIconPaths()
        fakeLogGroup = {
            logGroupName: "it'sBig/it'sHeavy/it'sWood",
            arn: "it'sBetterThanBadIt'sGood",
        }

        testNode = new LogGroupNode(parentNode, 'someregioncode', fakeLogGroup)
    })

    after(async () => {
        clearTestIconPaths()
    })

    it('instantiates without issue', async () => {
        assert.ok(testNode)
    })

    it('initializes the parent node', async () => {
        assert.strictEqual(testNode.parent, parentNode, 'unexpected parent node')
    })

    it('initializes the region code', async () => {
        assert.strictEqual(testNode.regionCode, 'someregioncode')
    })

    it('initializes the label', async () => {
        assert.strictEqual(testNode.label, fakeLogGroup.logGroupName)
    })

    it('initializes the functionName', async () => {
        assert.strictEqual(testNode.name, fakeLogGroup.logGroupName)
    })

    it('initializes the tooltip', async () => {
        assert.strictEqual(testNode.tooltip, `${fakeLogGroup.logGroupName}${os.EOL}${fakeLogGroup.arn}`)
    })

    it('initializes the icon', async () => {
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.cloudWatchLogGroup, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.cloudWatchLogGroup, 'Unexpected light icon path')
    })

    it('has no children', async () => {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected node to have no children')
    })
})
