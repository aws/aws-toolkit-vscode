/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { TreeItemCollapsibleState } from 'vscode'
import { StacksNode } from '../../../../../awsService/cloudformation/explorer/nodes/stacksNode'
import { StacksManager } from '../../../../../awsService/cloudformation/stacks/stacksManager'
import { ChangeSetsManager } from '../../../../../awsService/cloudformation/stacks/changeSetsManager'
import { StackSummary } from '@aws-sdk/client-cloudformation'

describe('StacksNode', function () {
    let stacksNode: StacksNode
    let mockStacksManager: sinon.SinonStubbedInstance<StacksManager>
    let mockChangeSetsManager: ChangeSetsManager
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockStacksManager = {
            get: sandbox.stub(),
            hasMore: sandbox.stub(),
            isLoaded: sandbox.stub(),
            ensureLoaded: sandbox.stub(),
            loadMoreStacks: sandbox.stub(),
        } as any
        mockChangeSetsManager = {} as ChangeSetsManager
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should set correct properties when not loaded', function () {
            mockStacksManager.get.returns([])
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(false)

            stacksNode = new StacksNode(mockStacksManager as any, mockChangeSetsManager)

            assert.strictEqual(stacksNode.label, 'Stacks')
            assert.strictEqual(stacksNode.collapsibleState, TreeItemCollapsibleState.Collapsed)
            assert.strictEqual(stacksNode.description, undefined)
            assert.strictEqual(stacksNode.contextValue, 'stackSection')
        })

        it('should set description when loaded', function () {
            const mockStacks: StackSummary[] = [
                { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' } as StackSummary,
                { StackName: 'stack-2', StackStatus: 'UPDATE_COMPLETE' } as StackSummary,
            ]
            mockStacksManager.get.returns(mockStacks)
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(true)

            stacksNode = new StacksNode(mockStacksManager as any, mockChangeSetsManager)

            assert.strictEqual(stacksNode.description, '(2)')
            assert.strictEqual(stacksNode.contextValue, 'stackSection')
        })

        it('should set contextValue to stackSectionWithMore when hasMore', function () {
            const mockStacks: StackSummary[] = [
                { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' } as StackSummary,
            ]
            mockStacksManager.get.returns(mockStacks)
            mockStacksManager.hasMore.returns(true)
            mockStacksManager.isLoaded.returns(true)

            stacksNode = new StacksNode(mockStacksManager as any, mockChangeSetsManager)

            assert.strictEqual(stacksNode.description, '(1+)')
            assert.strictEqual(stacksNode.contextValue, 'stackSectionWithMore')
        })
    })

    describe('getChildren', function () {
        beforeEach(function () {
            mockStacksManager.get.returns([])
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(false)
            stacksNode = new StacksNode(mockStacksManager as any, mockChangeSetsManager)
        })

        it('should call ensureLoaded', async function () {
            mockStacksManager.ensureLoaded.resolves()

            await stacksNode.getChildren()

            assert.strictEqual(mockStacksManager.ensureLoaded.calledOnce, true)
        })

        it('should return StackNode for each stack', async function () {
            const mockStacks: StackSummary[] = [
                { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' } as StackSummary,
                { StackName: 'stack-2', StackStatus: 'UPDATE_COMPLETE' } as StackSummary,
            ]
            mockStacksManager.ensureLoaded.resolves()
            mockStacksManager.get.returns(mockStacks)
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(true)

            const children = await stacksNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.strictEqual(children[0].label, 'stack-1')
            assert.strictEqual(children[1].label, 'stack-2')
        })

        it('should include LoadMoreStacksNode when hasMore', async function () {
            const mockStacks: StackSummary[] = [
                { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' } as StackSummary,
            ]
            mockStacksManager.ensureLoaded.resolves()
            mockStacksManager.get.returns(mockStacks)
            mockStacksManager.hasMore.returns(true)
            mockStacksManager.isLoaded.returns(true)

            const children = await stacksNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.strictEqual(children[0].label, 'stack-1')
            assert.strictEqual(children[1].label, '[Load More...]')
            assert.strictEqual(children[1].contextValue, 'loadMoreStacks')
        })

        it('should update node description after load', async function () {
            const mockStacks: StackSummary[] = [
                { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' } as StackSummary,
            ]
            mockStacksManager.ensureLoaded.resolves()
            mockStacksManager.get.returns(mockStacks)
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(true)

            await stacksNode.getChildren()

            assert.strictEqual(stacksNode.description, '(1)')
            assert.strictEqual(stacksNode.contextValue, 'stackSection')
        })

        it('should return empty array when no stacks', async function () {
            mockStacksManager.ensureLoaded.resolves()
            mockStacksManager.get.returns([])
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(true)

            const children = await stacksNode.getChildren()

            assert.strictEqual(children.length, 0)
        })
    })

    describe('loadMoreStacks', function () {
        beforeEach(function () {
            mockStacksManager.get.returns([])
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(false)
            stacksNode = new StacksNode(mockStacksManager as any, mockChangeSetsManager)
        })

        it('should call stacksManager.loadMoreStacks', async function () {
            mockStacksManager.loadMoreStacks.resolves()

            await stacksNode.loadMoreStacks()

            assert.strictEqual(mockStacksManager.loadMoreStacks.calledOnce, true)
        })

        it('should update node description after loading more', async function () {
            const mockStacks: StackSummary[] = [
                { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' } as StackSummary,
                { StackName: 'stack-2', StackStatus: 'UPDATE_COMPLETE' } as StackSummary,
            ]
            mockStacksManager.loadMoreStacks.resolves()
            mockStacksManager.get.returns(mockStacks)
            mockStacksManager.hasMore.returns(true)
            mockStacksManager.isLoaded.returns(true)

            await stacksNode.loadMoreStacks()

            assert.strictEqual(stacksNode.description, '(2+)')
            assert.strictEqual(stacksNode.contextValue, 'stackSectionWithMore')
        })

        it('should update contextValue when no more stacks', async function () {
            const mockStacks: StackSummary[] = [
                { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' } as StackSummary,
            ]
            mockStacksManager.loadMoreStacks.resolves()
            mockStacksManager.get.returns(mockStacks)
            mockStacksManager.hasMore.returns(false)
            mockStacksManager.isLoaded.returns(true)

            await stacksNode.loadMoreStacks()

            assert.strictEqual(stacksNode.description, '(1)')
            assert.strictEqual(stacksNode.contextValue, 'stackSection')
        })
    })
})
