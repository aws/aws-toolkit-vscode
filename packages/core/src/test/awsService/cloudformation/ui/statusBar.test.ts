/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { createDeploymentStatusBar, updateWorkflowStatus } from '../../../../awsService/cloudformation/ui/statusBar'
import { StackActionPhase } from '../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'
import { getTestWindow } from '../../../shared/vscode/window'

describe('StatusBar', function () {
    let sandbox: sinon.SinonSandbox
    let clock: sinon.SinonFakeTimers

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        clock = sandbox.useFakeTimers()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('createDeploymentStatusBar', function () {
        it('creates status bar handle', function () {
            const handle = createDeploymentStatusBar('stack1', 'Validation')

            assert.ok(handle)
            assert.strictEqual(typeof handle.update, 'function')
            assert.strictEqual(typeof handle.release, 'function')

            handle.release()
            clock.tick(5000)
        })

        it('creates handle for deployment with changeset', function () {
            const handle = createDeploymentStatusBar('stack1', 'Deployment', 'changeset1')

            assert.ok(handle)

            handle.release()
            clock.tick(5000)
        })

        it('shows single operation with stack name', function () {
            const handle = createDeploymentStatusBar('my-stack', 'Validation')
            const statusBar = getTestWindow().statusBar

            const messages = statusBar.messages
            assert.ok(messages.some((msg) => msg.includes('Validating my-stack')))

            handle.release()
            clock.tick(5000)
        })

        it('shows count for multiple operations', function () {
            const handle1 = createDeploymentStatusBar('stack1', 'Validation')
            const handle2 = createDeploymentStatusBar('stack2', 'Deployment', 'changeset1')
            const statusBar = getTestWindow().statusBar

            const messages = statusBar.messages
            assert.ok(messages.some((msg) => msg.includes('AWS CloudFormation (2)')))

            handle1.release()
            handle2.release()
            clock.tick(5000)
        })
    })

    describe('updateWorkflowStatus', function () {
        it('updates single operation display', function () {
            const handle = createDeploymentStatusBar('my-stack', 'Validation')
            const statusBar = getTestWindow().statusBar

            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_IN_PROGRESS)
            assert.ok(statusBar.messages.some((msg) => msg.includes('Validating my-stack')))

            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_COMPLETE)
            assert.ok(statusBar.messages.some((msg) => msg.includes('Validated my-stack')))

            handle.release()
            clock.tick(5000)
        })

        it('shows failure for single operation', function () {
            const handle = createDeploymentStatusBar('my-stack', 'Validation')
            const statusBar = getTestWindow().statusBar

            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_FAILED)
            assert.ok(statusBar.messages.some((msg) => msg.includes('Validation Failed: my-stack')))

            handle.release()
            clock.tick(5000)
        })

        it('handles terminal phases', function () {
            const handle = createDeploymentStatusBar('stack1', 'Validation')

            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_COMPLETE)
            handle.release()

            clock.tick(5000)
        })

        it('handles multiple concurrent operations', function () {
            const handle1 = createDeploymentStatusBar('stack1', 'Validation')
            const handle2 = createDeploymentStatusBar('stack2', 'Deployment', 'changeset1')

            updateWorkflowStatus(handle1, StackActionPhase.VALIDATION_COMPLETE)
            updateWorkflowStatus(handle2, StackActionPhase.DEPLOYMENT_COMPLETE)

            handle1.release()
            handle2.release()

            clock.tick(5000)
        })

        it('handles deployment operations', function () {
            const handle = createDeploymentStatusBar('my-stack', 'Deployment', 'changeset1')
            const statusBar = getTestWindow().statusBar

            updateWorkflowStatus(handle, StackActionPhase.DEPLOYMENT_IN_PROGRESS)
            assert.ok(statusBar.messages.some((msg) => msg.includes('Deploying my-stack')))

            updateWorkflowStatus(handle, StackActionPhase.DEPLOYMENT_COMPLETE)
            assert.ok(statusBar.messages.some((msg) => msg.includes('Deployed my-stack')))

            handle.release()
            clock.tick(5000)
        })

        it('shows deployment failure', function () {
            const handle = createDeploymentStatusBar('my-stack', 'Deployment', 'changeset1')
            const statusBar = getTestWindow().statusBar

            updateWorkflowStatus(handle, StackActionPhase.DEPLOYMENT_FAILED)
            assert.ok(statusBar.messages.some((msg) => msg.includes('Deployment Failed: my-stack')))

            handle.release()
            clock.tick(5000)
        })

        it('disposes after all operations complete', function () {
            const handle1 = createDeploymentStatusBar('stack1', 'Validation')
            const handle2 = createDeploymentStatusBar('stack2', 'Deployment', 'changeset1')
            const statusBar = getTestWindow().statusBar

            updateWorkflowStatus(handle1, StackActionPhase.VALIDATION_COMPLETE)
            updateWorkflowStatus(handle2, StackActionPhase.DEPLOYMENT_COMPLETE)

            handle1.release()
            handle2.release()

            const beforeDispose = statusBar.items.length
            clock.tick(5000)
            const afterDispose = statusBar.items.filter((item) => !item.disposed).length

            assert.ok(afterDispose < beforeDispose)
        })
    })
})
