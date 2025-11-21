/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SinonSandbox, SinonStub, createSandbox } from 'sinon'
import { commands } from 'vscode'
import { ChangeSetDeletion } from '../../../../../awsService/cloudformation/stacks/actions/changeSetDeletionWorkflow'
import {
    StackActionPhase,
    StackActionState,
} from '../../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'
import { commandKey } from '../../../../../awsService/cloudformation/utils'
import { globals } from '../../../../../shared'

describe('ChangeSetDeletion', function () {
    let sandbox: SinonSandbox

    beforeEach(function () {
        sandbox = createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('delete', function () {
        let mockClient: any
        let executeCommandStub: SinonStub
        let getChangeSetDeletionStatusStub: SinonStub
        let describeChangeSetDeletionStatusStub: SinonStub

        beforeEach(function () {
            mockClient = { sendRequest: sandbox.stub().resolves({}) }
            executeCommandStub = sandbox.stub(commands, 'executeCommand').resolves()

            const stackActionApi = require('../../../../../awsService/cloudformation/stacks/actions/stackActionApi')
            getChangeSetDeletionStatusStub = sandbox.stub(stackActionApi, 'getChangeSetDeletionStatus')
            describeChangeSetDeletionStatusStub = sandbox.stub(stackActionApi, 'describeChangeSetDeletionStatus')
            sandbox.stub(stackActionApi, 'deleteChangeSet').resolves()
            sandbox.stub(globals.clock, 'clearInterval')
        })

        it('should call refresh command after successful deletion', async function () {
            getChangeSetDeletionStatusStub.resolves({
                phase: StackActionPhase.DELETION_COMPLETE,
                state: StackActionState.SUCCESSFUL,
            })

            const deletion = new ChangeSetDeletion('test-stack', 'test-changeset', mockClient)
            await deletion.delete()
            await new Promise((resolve) => setImmediate(resolve))

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should call refresh command after failed deletion', async function () {
            getChangeSetDeletionStatusStub.resolves({ phase: StackActionPhase.DELETION_FAILED })
            describeChangeSetDeletionStatusStub.resolves({ FailureReason: 'Test failure' })

            const deletion = new ChangeSetDeletion('test-stack', 'test-changeset', mockClient)
            await deletion.delete()
            await new Promise((resolve) => setImmediate(resolve))

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should not call refresh command when polling encounters error', async function () {
            getChangeSetDeletionStatusStub.rejects(new Error('Polling error'))

            const deletion = new ChangeSetDeletion('test-stack', 'test-changeset', mockClient)
            await deletion.delete()
            await new Promise((resolve) => setImmediate(resolve))

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })
    })
})
