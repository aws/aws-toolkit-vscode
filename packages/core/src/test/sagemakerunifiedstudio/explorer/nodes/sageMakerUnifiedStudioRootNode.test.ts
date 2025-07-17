/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import {
    SageMakerUnifiedStudioRootNode,
    selectSMUSProject,
} from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRootNode'
import { SageMakerUnifiedStudioProjectNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioProjectNode'
import {
    DataZoneClient,
    DataZoneProject,
    setDefaultDatazoneDomainId,
    resetDefaultDatazoneDomainId,
} from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { SageMakerUnifiedStudioRegionNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRegionNode'
import * as pickerPrompter from '../../../../shared/ui/pickerPrompter'

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
        it('should initialize id and resource properties', function () {
            const node = new SageMakerUnifiedStudioRootNode()
            assert.strictEqual(node.id, 'smusRootNode')
            assert.strictEqual(node.resource, node)
            assert.ok(node.getProjectRegionNode() instanceof SageMakerUnifiedStudioRegionNode)
            assert.ok(node.getProjectSelectNode() instanceof SageMakerUnifiedStudioProjectNode)
            assert.strictEqual(typeof node.onDidChangeTreeItem, 'function')
            assert.strictEqual(typeof node.onDidChangeChildren, 'function')
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
        it('returns root nodes', async function () {
            mockDataZoneClient.listProjects.resolves({ projects: [mockProject], nextToken: undefined })

            const children = await rootNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.ok(children[0] instanceof SageMakerUnifiedStudioRegionNode)
            assert.ok(children[1] instanceof SageMakerUnifiedStudioProjectNode)
            // The first child is the region node, the second is the project node
            assert.strictEqual(children[0].id, 'smusProjectRegionNode')
            assert.strictEqual(children[1].id, 'smusProjectNode')

            assert.strictEqual(children.length, 2)
            assert.strictEqual(children[1].id, 'smusProjectNode')

            const treeItem = await children[1].getTreeItem()
            assert.strictEqual(treeItem.label, 'Select a project')
            assert.strictEqual(treeItem.contextValue, 'smusProjectSelectPicker')
            assert.deepStrictEqual(treeItem.command, {
                command: 'aws.smus.projectView',
                title: 'Select Project',
                arguments: [children[1]],
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

describe('SelectSMUSProject', function () {
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let mockProjectNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioProjectNode>
    let createQuickPickStub: sinon.SinonStub

    const testDomainId = 'test-domain-123'
    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: testDomainId,
    }

    beforeEach(function () {
        // Create mock DataZone client
        mockDataZoneClient = {
            getDomainId: sinon.stub().returns(testDomainId),
            listProjects: sinon.stub(),
        } as any

        // Create mock project node
        mockProjectNode = {
            setSelectedProject: sinon.stub(),
        } as any

        // Stub DataZoneClient static methods
        sinon.stub(DataZoneClient, 'getInstance').returns(mockDataZoneClient as any)

        // Stub quickPick
        const mockQuickPick = {
            prompt: sinon.stub().resolves(mockProject),
        }
        createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('lists projects and returns selected project', async function () {
        mockDataZoneClient.listProjects.resolves({ projects: [mockProject], nextToken: undefined })

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, mockProject)
        assert.ok(mockDataZoneClient.listProjects.calledOnce)
        assert.ok(
            mockDataZoneClient.listProjects.calledWith({
                domainId: testDomainId,
                maxResults: 50,
            })
        )
        assert.ok(createQuickPickStub.calledOnce)
        assert.ok(mockProjectNode.setSelectedProject.calledWith(mockProject))
    })

    it('shows message when no projects found', async function () {
        mockDataZoneClient.listProjects.resolves({ projects: [], nextToken: undefined })

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, undefined)
        assert.ok(!mockProjectNode.setSelectedProject.called)
    })

    it('uses provided domain ID when specified', async function () {
        mockDataZoneClient.listProjects.resolves({ projects: [mockProject], nextToken: undefined })
        const customDomainId = 'custom-domain-456'

        await selectSMUSProject(mockProjectNode as any, customDomainId)

        assert.ok(
            mockDataZoneClient.listProjects.calledWith({
                domainId: customDomainId,
                maxResults: 50,
            })
        )
    })
})
