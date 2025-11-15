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
})
