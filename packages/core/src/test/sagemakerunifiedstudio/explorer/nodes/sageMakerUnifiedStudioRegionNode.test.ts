/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioRegionNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRegionNode'

describe('SageMakerUnifiedStudioRegionNode', function () {
    let regionNode: SageMakerUnifiedStudioRegionNode

    beforeEach(function () {
        regionNode = new SageMakerUnifiedStudioRegionNode('us-west-2')
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(regionNode.id, 'smusProjectRegionNode')
            assert.deepStrictEqual(regionNode.resource, {})
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item', function () {
            const treeItem = regionNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Region: us-west-2')
            assert.strictEqual(treeItem.contextValue, 'smusProjectRegion')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon)
            assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'location')
        })
    })

    describe('getParent', function () {
        it('returns undefined', function () {
            assert.strictEqual(regionNode.getParent(), undefined)
        })
    })
})
