/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { StackViewCoordinator } from '../../../../awsService/cloudformation/ui/stackViewCoordinator'

describe('StackViewCoordinator', () => {
    let coordinator: StackViewCoordinator

    beforeEach(() => {
        coordinator = new StackViewCoordinator()
    })

    afterEach(() => {
        coordinator.dispose()
    })

    it('should initialize with undefined state', () => {
        assert.strictEqual(coordinator.currentStackName, undefined)
        assert.strictEqual(coordinator.currentStackStatus, undefined)
        assert.strictEqual(coordinator.isChangeSetMode, false)
    })

    it('should set stack name and status', async () => {
        await coordinator.setStack('test-stack', 'CREATE_COMPLETE')

        assert.strictEqual(coordinator.currentStackName, 'test-stack')
        assert.strictEqual(coordinator.currentStackStatus, 'CREATE_COMPLETE')
        assert.strictEqual(coordinator.isChangeSetMode, false)
    })

    it('should fire event when stack changes', async () => {
        let eventFired = false
        let receivedState: any

        coordinator.onDidChangeStack((state) => {
            eventFired = true
            receivedState = state
        })

        await coordinator.setStack('test-stack', 'CREATE_IN_PROGRESS')

        assert.strictEqual(eventFired, true)
        assert.strictEqual(receivedState.stackName, 'test-stack')
        assert.strictEqual(receivedState.stackStatus, 'CREATE_IN_PROGRESS')
        assert.strictEqual(receivedState.isChangeSetMode, false)
    })

    it('should call status update callback when status changes', async () => {
        let callbackCount = 0
        let receivedStackName: string | undefined
        let receivedStatus: string | undefined

        coordinator.setStackStatusUpdateCallback((stackName, status) => {
            callbackCount++
            receivedStackName = stackName
            receivedStatus = status
        })

        await coordinator.setStack('test-stack', 'CREATE_COMPLETE')

        assert.strictEqual(callbackCount, 1)
        assert.strictEqual(receivedStackName, 'test-stack')
        assert.strictEqual(receivedStatus, 'CREATE_COMPLETE')

        await coordinator.setStack('test-stack', 'UPDATE_IN_PROGRESS')

        assert.strictEqual(callbackCount, 2)
        assert.strictEqual(receivedStatus, 'UPDATE_IN_PROGRESS')
    })

    it('should not call callback if status unchanged', async () => {
        let callbackCount = 0

        coordinator.setStackStatusUpdateCallback(() => {
            callbackCount++
        })

        await coordinator.setStack('test-stack', 'CREATE_COMPLETE')
        assert.strictEqual(callbackCount, 1)

        await coordinator.setStack('test-stack', 'CREATE_COMPLETE')
        assert.strictEqual(callbackCount, 1)
    })

    it('should set change set mode', async () => {
        await coordinator.setChangeSetMode('test-stack', true)

        assert.strictEqual(coordinator.currentStackName, 'test-stack')
        assert.strictEqual(coordinator.isChangeSetMode, true)
    })

    it('should clear stack', async () => {
        await coordinator.setStack('test-stack', 'CREATE_COMPLETE')
        await coordinator.clearStack()

        assert.strictEqual(coordinator.currentStackName, undefined)
        assert.strictEqual(coordinator.currentStackStatus, undefined)
        assert.strictEqual(coordinator.isChangeSetMode, false)
    })
})
