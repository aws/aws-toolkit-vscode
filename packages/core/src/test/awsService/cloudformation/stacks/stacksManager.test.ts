/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StacksManager } from '../../../../awsService/cloudformation/stacks/stacksManager'

describe('StacksManager', () => {
    let sandbox: sinon.SinonSandbox
    let manager: StacksManager
    let mockClient: any

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub().resolves({
                stacks: [
                    { StackName: 'stack-1', StackStatus: 'CREATE_COMPLETE' },
                    { StackName: 'stack-2', StackStatus: 'UPDATE_IN_PROGRESS' },
                ],
                nextToken: undefined,
            }),
        }
        manager = new StacksManager(mockClient)
    })

    afterEach(() => {
        manager.dispose()
        sandbox.restore()
    })

    describe('updateStackStatus', () => {
        beforeEach(async () => {
            await new Promise<void>((resolve) => {
                manager.addListener(() => resolve())
                manager.reload()
            })
        })

        it('should update status of existing stack', () => {
            manager.updateStackStatus('stack-1', 'UPDATE_COMPLETE')

            const stacks = manager.get()
            const updatedStack = stacks.find((s) => s.StackName === 'stack-1')
            assert.strictEqual(updatedStack?.StackStatus, 'UPDATE_COMPLETE')
        })

        it('should not affect other stacks', () => {
            manager.updateStackStatus('stack-1', 'UPDATE_COMPLETE')

            const stacks = manager.get()
            const otherStack = stacks.find((s) => s.StackName === 'stack-2')
            assert.strictEqual(otherStack?.StackStatus, 'UPDATE_IN_PROGRESS')
        })

        it('should notify listeners when status updated', () => {
            let listenerCalled = false
            manager.addListener(() => {
                listenerCalled = true
            })

            manager.updateStackStatus('stack-1', 'UPDATE_COMPLETE')

            assert.strictEqual(listenerCalled, true)
        })

        it('should do nothing if stack not found', () => {
            const stacksBefore = manager.get()
            manager.updateStackStatus('non-existent-stack', 'CREATE_COMPLETE')
            const stacksAfter = manager.get()

            assert.deepStrictEqual(stacksBefore, stacksAfter)
        })
    })

    describe('lazy loading', () => {
        it('should not load stacks on construction', () => {
            assert.strictEqual(mockClient.sendRequest.called, false)
        })

        it('should return empty array when not loaded', () => {
            const stacks = manager.get()
            assert.deepStrictEqual(stacks, [])
        })

        it('should report not loaded initially', () => {
            assert.strictEqual(manager.isLoaded(), false)
        })

        it('should load stacks on ensureLoaded', async () => {
            await manager.ensureLoaded()
            assert.strictEqual(mockClient.sendRequest.calledOnce, true)
        })

        it('should not reload on subsequent ensureLoaded calls', async () => {
            await manager.ensureLoaded()
            await manager.ensureLoaded()
            assert.strictEqual(mockClient.sendRequest.calledOnce, true)
        })

        it('should report loaded after ensureLoaded', async () => {
            await manager.ensureLoaded()
            assert.strictEqual(manager.isLoaded(), true)
        })

        it('should return stacks after ensureLoaded', async () => {
            await manager.ensureLoaded()
            const stacks = manager.get()
            assert.strictEqual(stacks.length, 2)
            assert.strictEqual(stacks[0].StackName, 'stack-1')
        })
    })

    describe('clear', () => {
        beforeEach(async () => {
            await manager.ensureLoaded()
        })

        it('should clear stacks', () => {
            manager.clear()
            const stacks = manager.get()
            assert.deepStrictEqual(stacks, [])
        })

        it('should reset loaded state', () => {
            manager.clear()
            assert.strictEqual(manager.isLoaded(), false)
        })

        it('should clear nextToken', () => {
            manager.clear()
            assert.strictEqual(manager.hasMore(), false)
        })

        it('should notify listeners', () => {
            let listenerCalled = false
            manager.addListener(() => {
                listenerCalled = true
            })
            manager.clear()
            assert.strictEqual(listenerCalled, true)
        })

        it('should allow reload after clear', async () => {
            manager.clear()
            mockClient.sendRequest.resetHistory()
            await manager.ensureLoaded()
            assert.strictEqual(mockClient.sendRequest.calledOnce, true)
        })
    })

    describe('error handling', () => {
        it('should set loaded=true even when loadStacks fails', async () => {
            // Arrange: Mock client to reject with an error
            mockClient.sendRequest.rejects(new Error('Access denied'))

            // Act: Try to load stacks (should fail but not throw)
            await manager.ensureLoaded()

            // Assert: Manager should still be marked as loaded to prevent infinite retries
            assert.strictEqual(manager.isLoaded(), true)

            // Assert: Stacks should be empty array after error
            assert.deepStrictEqual(manager.get(), [])
        })
    })
})
