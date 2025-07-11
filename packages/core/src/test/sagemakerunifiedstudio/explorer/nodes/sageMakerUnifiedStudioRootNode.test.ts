/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioRootNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRootNode'
import { SageMakerUnifiedStudioProjectNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioProjectNode'
import {
    DataZoneClient,
    DataZoneProject,
    setDefaultDatazoneDomainId,
    resetDefaultDatazoneDomainId,
} from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'

describe('SmusRootNode', function () {
    let rootNode: SageMakerUnifiedStudioRootNode
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>

    const testDomainId = 'test-domain-123'
    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: testDomainId,
    }

    beforeEach(function () {
        rootNode = new SageMakerUnifiedStudioRootNode()

        // Set mock domain ID
        setDefaultDatazoneDomainId(testDomainId)

        // Create mock DataZone client
        mockDataZoneClient = {
            getDomainId: sinon.stub().returns(testDomainId),
            listProjects: sinon.stub(),
        } as any

        // Stub DataZoneClient static methods
        sinon.stub(DataZoneClient, 'getInstance').returns(mockDataZoneClient as any)
    })

    afterEach(function () {
        sinon.restore()
        resetDefaultDatazoneDomainId()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(rootNode.id, 'sageMakerUnifiedStudio')
            assert.strictEqual(rootNode.resource, rootNode)
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item', async function () {
            const treeItem = rootNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'SageMaker Unified Studio')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
            assert.strictEqual(treeItem.contextValue, 'sageMakerUnifiedStudioRoot')
            assert.ok(treeItem.iconPath)
        })
    })

    describe('getChildren', function () {
        it('returns project nodes when projects exist', async function () {
            mockDataZoneClient.listProjects.resolves({ projects: [mockProject], nextToken: undefined })

            const children = await rootNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.ok(children[0] instanceof SageMakerUnifiedStudioProjectNode)
            assert.strictEqual(
                (children[0] as SageMakerUnifiedStudioProjectNode).id,
                'sageMakerUnifiedStudioProject-project-123'
            )
        })

        it('returns no projects node when no projects found', async function () {
            mockDataZoneClient.listProjects.resolves({ projects: [], nextToken: undefined })

            const children = await rootNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'sageMakerUnifiedStudioNoProject')

            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, 'No projects found')
            assert.strictEqual(treeItem.contextValue, 'sageMakerUnifiedStudioNoProject')
        })

        it('returns error node when listProjects fails', async function () {
            const error = new Error('Failed to list projects')
            mockDataZoneClient.listProjects.rejects(error)

            const children = await rootNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'sageMakerUnifiedStudioErrorProject')

            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, 'Error loading projects (click to retry)')
            assert.strictEqual(treeItem.contextValue, 'sageMakerUnifiedStudioErrorProject')
            assert.strictEqual(treeItem.tooltip, error.message)
            assert.deepStrictEqual(treeItem.command, {
                command: 'aws.smus.retryProjects',
                title: 'Retry Loading Projects',
            })
        })
    })

    describe('refresh', function () {
        it('fires change events', function () {
            const onDidChangeTreeItemSpy = sinon.spy()
            const onDidChangeChildrenSpy = sinon.spy()

            rootNode.onDidChangeTreeItem(onDidChangeTreeItemSpy)
            rootNode.onDidChangeChildren(onDidChangeChildrenSpy)

            rootNode.refresh()

            assert(onDidChangeTreeItemSpy.calledOnce)
            assert(onDidChangeChildrenSpy.calledOnce)
        })
    })
})
