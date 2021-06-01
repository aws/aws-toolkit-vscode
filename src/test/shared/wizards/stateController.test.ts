/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StateMachineController, WIZARD_GOBACK, WIZARD_RETRY } from '../../../shared/wizards/stateController'

function assertSteps<T>(controller: StateMachineController<T>, current: number, total: number, state?: T): { nextState?: T } {
    assert.strictEqual(controller.currentStep, current)
    assert.strictEqual(controller.totalSteps, total)
    return { nextState: state }
}

describe('StateMachineController', function () {
    it('runs with no steps', async function () {
        const controller = new StateMachineController()
        await assert.doesNotReject(controller.run())
    })

    it('handles undefined steps', async function () {
        const controller = new StateMachineController()
        controller.addStep(async () => ({ nextState: {}, nextSteps: undefined }))
        await assert.doesNotReject(controller.run())
    })

    it('can be reset', async function() {
        const controller = new StateMachineController<number>()
        const step1 = sinon.stub()
        const step2 = sinon.stub()
        step1.onFirstCall().returns(1)
        step2.onFirstCall().returns(2)
        step1.onSecondCall().returns(3)
        step2.onSecondCall().returns(4)
        controller.addStep(step1)
        controller.addStep(step2)

        assert.strictEqual(await controller.run(), 2)
        controller.reset()
        assert.strictEqual(await controller.run(), 4)
    })

    it('detects cycle', async function() {
        const controller = new StateMachineController<number>()
        const step1 = sinon.stub()
        const step2 = sinon.stub()
        step1.returns({})
        step2.onFirstCall().returns(WIZARD_GOBACK)
        step2.onSecondCall().returns({ nextState: {}, nextSteps: [step1] })
        controller.addStep(step1)
        controller.addStep(step2)

        await assert.rejects(controller.run(), /Cycle/)
    })

    describe('retry', function () {
        it('repeats current step', async function () {
            const controller = new StateMachineController()
            const stub = sinon.stub()
            stub.onFirstCall().returns(WIZARD_RETRY)
            stub.onSecondCall().returns({})
            controller.addStep(stub)

            await controller.run()

            assert.strictEqual(stub.callCount, 2)
        })

        it('does not remember state on retry', async function () {
            const controller = new StateMachineController<{ answer: boolean }>()
            const stub = sinon.stub()
            stub.onFirstCall().returns({ nextState: { answer: true }, repeatStep: true })
            stub.onSecondCall().returns({ answer: false })
            controller.addStep(stub)

            assert.strictEqual((await controller.run())?.answer, false)
            assert.strictEqual(stub.callCount, 2)
        })
    })

    describe('branching', function () {
        it('supports multiple steps per branch', async function () {
            const controller = new StateMachineController()
            const step1 = sinon.stub()
            const branchStep1 = sinon.stub()
            const branchStep2 = sinon.stub()
            step1.returns({ nextState: {}, nextSteps: [branchStep1, branchStep2] })
            branchStep1.callsFake(state => assertSteps(controller, 2, 3, state))
            branchStep2.returns({})
            controller.addStep(step1)

            assert.notStrictEqual(await controller.run(), undefined)
        })

        it('branches can also branch', async function () {
            const controller = new StateMachineController()
            const step1 = sinon.stub()
            const branch1Step1 = sinon.stub()
            const branch1Step2 = sinon.stub()
            const branch2 = sinon.stub()
            const step5 = sinon.stub()
            step1.returns({ nextState: {}, nextSteps: [branch1Step1, branch1Step2] })
            branch1Step1.callsFake(state => assertSteps(controller, 2, 4, state))
            branch1Step2.returns({ nextState: {}, nextSteps: [branch2] })
            branch2.callsFake(state => assertSteps(controller, 4, 5, state))
            step5.returns({})
            controller.addStep(step1)
            controller.addStep(step5)

            assert.notStrictEqual(await controller.run(), undefined)
        })
    })

    describe('go back', function () {
        it('goes back', async function () {
            const controller = new StateMachineController()
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.returns({})
            step2.onFirstCall().returns(WIZARD_GOBACK)
            step2.onSecondCall().returns({})
            controller.addStep(step1)
            controller.addStep(step2)

            await controller.run()

            assert.strictEqual(step1.callCount, 2)
            sinon.assert.callOrder(step1, step2, step1, step2)
        })

        it('goes back and terminates', async function () {
            const controller = new StateMachineController()
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.onFirstCall().returns({})
            step2.onFirstCall().returns(WIZARD_GOBACK)
            step1.onSecondCall().returns(WIZARD_GOBACK)
            controller.addStep(step1)
            controller.addStep(step2)

            assert.strictEqual(await controller.run(), undefined)
            assert.strictEqual(step1.callCount, 2)
            sinon.assert.callOrder(step1, step2, step1)
        })

        it('states are presereved between steps', async function () {
            const controller = new StateMachineController<{ answer: boolean }>()
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.onFirstCall().returns({ answer: false })
            step2.onFirstCall().returns(WIZARD_GOBACK)
            step1.onSecondCall().callsFake(state => {
                assert.strictEqual(state.answer, undefined)
                return assertSteps(controller, 1, 2, { answer: true })
            })
            step2.onSecondCall().callsFake(state => state)
            controller.addStep(step1)
            controller.addStep(step2)

            assert.strictEqual((await controller.run())?.answer, true)
        })

        it('handles branches', async function () {
            const controller = new StateMachineController<{ branch1: string, branch2: string }>()
            const step1 = sinon.stub()
            const branch1 = sinon.stub()
            const branch2 = sinon.stub()
            const step3 = sinon.stub()
            // step1 -> branch1 -> step1 -> branch2 -> step3 -> branch2 -> step3 -> terminate
            step1.onFirstCall().returns({ nextState: { branch2: 'no' }, nextSteps: [branch1] })
            step1.onSecondCall().callsFake(() => {
                assertSteps(controller, 1, 2)
                return { nextState: { branch1: 'no' }, nextSteps: [branch2] }
            })
            branch1.returns(WIZARD_GOBACK)
            branch2.callsFake(state =>
                assertSteps(controller, 2, 3, { branch2: 'yes', branch1: state.branch1 })
            )
            step3.onFirstCall().returns(WIZARD_GOBACK)
            step3.onSecondCall().callsFake(state => state)
            controller.addStep(step1)
            controller.addStep(step3)

            const finalState = await controller.run()
            assert.ok(finalState !== undefined)
            assert.strictEqual(finalState.branch1, 'no')
            assert.strictEqual(finalState.branch2, 'yes')
            sinon.assert.callOrder(step1, branch1, step1, branch2, step3, branch2, step3)
        })
    })
})