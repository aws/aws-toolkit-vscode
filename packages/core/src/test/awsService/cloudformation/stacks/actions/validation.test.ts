/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SinonSandbox, SinonStub, createSandbox } from 'sinon'
import { commands } from 'vscode'
import {
    getLastValidation,
    setLastValidation,
    Validation,
} from '../../../../../awsService/cloudformation/stacks/actions/validationWorkflow'
import { commandKey } from '../../../../../awsService/cloudformation/utils'

describe('Validation', function () {
    let sandbox: SinonSandbox

    beforeEach(function () {
        sandbox = createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('last validation tracking', function () {
        it('should get and set last validation', function () {
            assert.strictEqual(getLastValidation(), undefined)

            const validation: any = { uri: 'test.yaml', stackName: 'test-stack' }
            setLastValidation(validation)
            assert.strictEqual(getLastValidation(), validation)

            setLastValidation(undefined)
            assert.strictEqual(getLastValidation(), undefined)
        })
    })

    describe('refresh command', function () {
        let mockClient: any
        let mockDiffProvider: any
        let executeCommandStub: SinonStub
        let validateStub: any
        let getValidationStatusStub: any
        let describeValidationStatusStub: any
        let clock: any

        beforeEach(function () {
            mockClient = { sendRequest: sandbox.stub().resolves({ changeSetName: 'test-changeset' }) }
            mockDiffProvider = { updateData: sandbox.stub() }
            executeCommandStub = sandbox.stub(commands, 'executeCommand').resolves()

            const stackActionApi = require('../../../../../awsService/cloudformation/stacks/actions/stackActionApi')
            validateStub = sandbox.stub(stackActionApi, 'validate').resolves({ changeSetName: 'test-changeset' })
            getValidationStatusStub = sandbox.stub(stackActionApi, 'getValidationStatus')
            describeValidationStatusStub = sandbox.stub(stackActionApi, 'describeValidationStatus')
            clock = sandbox.useFakeTimers()
        })

        it('should call refresh after validation starts', async function () {
            const validation = new Validation('file:///test.yaml', 'test-stack', mockClient, mockDiffProvider)
            await validation.validate()

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should not call refresh when validation API fails', async function () {
            validateStub.rejects(new Error('Validation API error'))

            const validation = new Validation('file:///test.yaml', 'test-stack', mockClient, mockDiffProvider)
            await validation.validate()

            assert.ok(!executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should call refresh after successful validation', async function () {
            getValidationStatusStub.resolves({
                phase: 'VALIDATION_COMPLETE',
                state: 'SUCCESSFUL',
                changes: [],
            })
            describeValidationStatusStub.resolves({ ValidationDetails: [] })

            const validation = new Validation('file:///test.yaml', 'test-stack', mockClient, mockDiffProvider)
            await validation.validate()
            await clock.tickAsync(1000)

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should call refresh after failed validation', async function () {
            getValidationStatusStub.resolves({ phase: 'VALIDATION_FAILED' })
            describeValidationStatusStub.resolves({ FailureReason: 'Test failure' })

            const validation = new Validation('file:///test.yaml', 'test-stack', mockClient, mockDiffProvider)
            await validation.validate()
            await clock.tickAsync(1000)

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })

        it('should call refresh when polling encounters error', async function () {
            getValidationStatusStub.rejects(new Error('Polling error'))

            const validation = new Validation('file:///test.yaml', 'test-stack', mockClient, mockDiffProvider)
            await validation.validate()
            await clock.tickAsync(1000)

            assert.ok(executeCommandStub.calledWith(commandKey('stacks.refresh')))
        })
    })
})
