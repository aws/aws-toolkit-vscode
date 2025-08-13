/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioComputeNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioComputeNode'
import { SageMakerUnifiedStudioProjectNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioProjectNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'
import { SagemakerClient } from '../../../../shared/clients/sagemaker'
import { SmusAuthenticationProvider } from '../../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'

describe('SageMakerUnifiedStudioComputeNode', function () {
    let computeNode: SageMakerUnifiedStudioComputeNode
    let mockParent: SageMakerUnifiedStudioProjectNode
    let mockExtensionContext: vscode.ExtensionContext
    let mockAuthProvider: SmusAuthenticationProvider
    let mockSagemakerClient: SagemakerClient

    beforeEach(function () {
        mockParent = {
            getProject: sinon.stub(),
        } as any

        mockExtensionContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file('/test'),
        } as any

        mockAuthProvider = {} as any
        mockSagemakerClient = {} as any

        computeNode = new SageMakerUnifiedStudioComputeNode(
            mockParent,
            mockExtensionContext,
            mockAuthProvider,
            mockSagemakerClient
        )
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(computeNode.id, 'smusComputeNode')
            assert.strictEqual(computeNode.resource, computeNode)
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item', async function () {
            const treeItem = await computeNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Compute')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert.strictEqual(treeItem.contextValue, 'smusComputeNode')
            assert.ok(treeItem.iconPath)
        })
    })

    describe('getChildren', function () {
        it('returns empty array when no project is selected', async function () {
            ;(mockParent.getProject as sinon.SinonStub).returns(undefined)

            const children = await computeNode.getChildren()

            assert.deepStrictEqual(children, [])
        })

        it('returns spaces node when project is selected', async function () {
            const mockProject = { id: 'project-123', name: 'Test Project' }
            ;(mockParent.getProject as sinon.SinonStub).returns(mockProject)

            // Stub the SpacesParentNode constructor to prevent actual instantiation
            sinon.stub(SageMakerUnifiedStudioSpacesParentNode.prototype, 'constructor' as any).returns({})

            const children = await computeNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.ok(children[0] instanceof SageMakerUnifiedStudioSpacesParentNode)
        })
    })

    describe('getParent', function () {
        it('returns parent node', function () {
            const parent = computeNode.getParent()
            assert.strictEqual(parent, mockParent)
        })
    })
})
