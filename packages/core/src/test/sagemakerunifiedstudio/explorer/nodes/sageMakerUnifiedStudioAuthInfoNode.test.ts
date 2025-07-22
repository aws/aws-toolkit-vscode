/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioAuthInfoNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioAuthInfoNode'
import { DataZoneClient } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'

describe('SageMakerUnifiedStudioAuthInfoNode', function () {
    let authInfoNode: SageMakerUnifiedStudioAuthInfoNode
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>

    const testDomainId = 'dzd_testdomain123'
    const testRegion = 'us-west-2'

    beforeEach(function () {
        authInfoNode = new SageMakerUnifiedStudioAuthInfoNode()

        // Create mock DataZone client
        mockDataZoneClient = {
            getDomainId: sinon.stub().returns(testDomainId),
            getRegion: sinon.stub().returns(testRegion),
        } as any

        // Stub DataZoneClient static methods
        sinon.stub(DataZoneClient, 'getInstance').returns(mockDataZoneClient as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(authInfoNode.id, 'smusAuthInfoNode')
            assert.deepStrictEqual(authInfoNode.resource, {})
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item with domain and region information', function () {
            const treeItem = authInfoNode.getTreeItem()

            assert.strictEqual(treeItem.label, `Domain: ${testDomainId}`)
            assert.strictEqual(treeItem.description, `Region: ${testRegion}`)
            assert.strictEqual(
                treeItem.tooltip,
                `Connected to SageMaker Unified Studio\nDomain ID: ${testDomainId}\nRegion: ${testRegion}`
            )
            assert.strictEqual(treeItem.contextValue, 'smusAuthInfo')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon)
            assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'key')
        })

        it('handles unknown domain and region', function () {
            // Mock empty domain ID and region
            mockDataZoneClient.getDomainId.returns('')
            mockDataZoneClient.getRegion.returns('')

            const treeItem = authInfoNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Domain: Unknown')
            assert.strictEqual(treeItem.description, 'Region: Unknown')
            assert.strictEqual(
                treeItem.tooltip,
                'Connected to SageMaker Unified Studio\nDomain ID: Unknown\nRegion: Unknown'
            )
        })
    })

    describe('getParent', function () {
        it('returns undefined', function () {
            assert.strictEqual(authInfoNode.getParent(), undefined)
        })
    })
})
