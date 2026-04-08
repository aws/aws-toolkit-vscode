/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SinonSandbox, SinonStub, createSandbox } from 'sinon'
import { commands } from 'vscode'
import { Deployment } from '../../../../../awsService/cloudformation/stacks/actions/deploymentWorkflow'
import {
    StackActionPhase,
    StackActionState,
} from '../../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'
import { commandKey } from '../../../../../awsService/cloudformation/utils'

describe('Deployment', function () {
    let sandbox: SinonSandbox

    beforeEach(function () {
        sandbox = createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('pollForProgress', function () {
        let mockClient: any
        let mockCoordinator: any
        let executeCommandStub: SinonStub
        let getDeploymentStatusStub: SinonStub
        let describeDeploymentStatusStub: SinonStub
        let clock: any

        beforeEach(function () {
            mockClient = { sendRequest: sandbox.stub().resolves({}) }
            mockCoordinator = { setStack: sandbox.stub().resolves() }
            executeCommandStub = sandbox.stub(commands, 'executeCommand').resolves()

            const stackActionApi = require('../../../../../awsService/cloudformation/stacks/actions/stackActionApi')
            getDeploymentStatusStub = sandbox.stub(stackActionApi, 'getDeploymentStatus')
            describeDeploymentStatusStub = sandbox.stub(stackActionApi, 'describeDeploymentStatus')
            sandbox.stub(stackActionApi, 'deploy').resolves()
            clock = sandbox.useFakeTimers()
        })

        it('should call refresh command after successful deployment', async function () {
            getDeploymentStatusStub.resolves({
                phase: StackActionPhase.DEPLOYMENT_COMPLETE,
                state: StackActionState.SUCCESSFUL,
            })

            const deployment = new Deployment('test-stack', 'test-changeset', mockClient, mockCoordinator)
            await deployment.deploy()
            await clock.tickAsync(1000)

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should call refresh command after failed deployment', async function () {
            getDeploymentStatusStub.resolves({ phase: StackActionPhase.DEPLOYMENT_FAILED })
            describeDeploymentStatusStub.resolves({ FailureReason: 'Test failure' })

            const deployment = new Deployment('test-stack', 'test-changeset', mockClient, mockCoordinator)
            await deployment.deploy()
            await clock.tickAsync(1000)

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should call refresh command when polling encounters error', async function () {
            getDeploymentStatusStub.rejects(new Error('Polling error'))

            const deployment = new Deployment('test-stack', 'test-changeset', mockClient, mockCoordinator)
            await deployment.deploy()
            await clock.tickAsync(1000)

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })
    })
})
