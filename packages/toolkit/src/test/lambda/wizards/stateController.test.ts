/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { StateMachineController, ControlSignal, StepResult } from '../../../shared/wizards/stateController'

function assertStepsPassthrough<T>(
    controller: StateMachineController<T>,
    current: number,
    total: number,
    result?: StepResult<T>
): StepResult<T> | undefined {
    assert.strictEqual(controller.currentStep, current)
    assert.strictEqual(controller.totalSteps, total)
    return result
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

    it('can exit mid-run', async function () {
        const controller = new StateMachineController<number>()
        const step1 = sinon.stub()
        const step2 = sinon.stub()
        const step3 = sinon.stub()
        step1.returns(0)
        step2.returns({ controlSignal: ControlSignal.Exit })
        step3.returns(1)
        controller.addStep(step1)
        controller.addStep(step2)
        controller.addStep(step3)

        assert.strictEqual(await controller.run(), undefined, 'State machine did not exit with an undefined state')
        assert.strictEqual(step3.called, false, 'The third step should not be called')
    })

    it('detects cycle', async function () {
        const controller = new StateMachineController<number>()
        const step1 = sinon.stub()
        const step2 = sinon.stub()
        step1.returns({})
        step2.onFirstCall().returns(undefined)
        step2.onSecondCall().returns({ nextState: {}, nextSteps: [step1] })
        controller.addStep(step1)
        controller.addStep(step2)

        await assert.rejects(controller.run(), /Cycle/)
    })

    it('can add the same function as a step multiple times', async function () {
        const controller = new StateMachineController<number>()
        const step1 = sinon.stub()
        step1.onFirstCall().returns(0)
        step1.onSecondCall().returns(1)
        controller.addStep(step1)
        controller.addStep(step1)

        assert.strictEqual(await controller.run(), 1)
    })

    it('step functions do not have side effects', async function () {
        const mystate = { mystring: '', isGood: true }
        const controller = new StateMachineController<{ mystring: string; isGood: boolean }>(mystate)
        const step1 = sinon.stub()
        const step2 = sinon.stub()
        const step3 = sinon.stub()
        step1.callsFake(state => {
            assert.strictEqual(state.mystring, '')
            state.mystring = 'a string'
            return state
        })
        step2.callsFake(state => {
            const last = state.isGood
            state.isGood = false
            return { ...state, isGood: last }
        })
        step3.onFirstCall().returns(undefined)
        step3.onSecondCall().callsFake(state => state)
        controller.addStep(step1)
        controller.addStep(step2)
        controller.addStep(step3)

        const result = await controller.run()
        assert.strictEqual(result?.mystring, 'a string')
        assert.strictEqual(result?.isGood, true)
    })

    describe('retry', function () {
        it('repeats current step', async function () {
            const controller = new StateMachineController()
            const stub = sinon.stub()
            stub.onFirstCall().returns({ controlSignal: ControlSignal.Retry })
            stub.onSecondCall().returns({})
            controller.addStep(stub)

            await controller.run()

            assert.strictEqual(stub.callCount, 2)
        })

        it('preserves last state', async function () {
            const controller = new StateMachineController<{ answer: boolean }>()
            const stub1 = sinon.stub()
            const stub2 = sinon.stub()
            stub1.returns({ nextState: { answer: true } })
            stub2.onFirstCall().returns({ controlSignal: ControlSignal.Retry })
            stub2.onSecondCall().callsFake(state => ({ nextState: state }))
            controller.addStep(stub1)
            controller.addStep(stub2)

            assert.strictEqual((await controller.run())?.answer, true)
        })

        it('does not remember state on retry', async function () {
            const controller = new StateMachineController<{ answer: boolean }>()
            const stub = sinon.stub()
            stub.onFirstCall().returns({ nextState: { answer: true }, controlSignal: ControlSignal.Retry })
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
            branchStep1.callsFake(state => assertStepsPassthrough(controller, 2, 3, { nextState: state }))
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
            branch1Step1.callsFake(state => assertStepsPassthrough(controller, 2, 4, state))
            branch1Step2.returns({ nextState: {}, nextSteps: [branch2] })
            branch2.callsFake(state => assertStepsPassthrough(controller, 4, 5, state))
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
            step2.onFirstCall().returns(undefined)
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
            step2.onFirstCall().returns(undefined)
            step1.onSecondCall().returns(undefined)
            controller.addStep(step1)
            controller.addStep(step2)

            assert.strictEqual(await controller.run(), undefined)
            assert.strictEqual(step1.callCount, 2)
            sinon.assert.callOrder(step1, step2, step1)
        })

        it('handles branches', async function () {
            const controller = new StateMachineController<{ branch1: string; branch2: string }>()
            const step1 = sinon.stub()
            const branch1 = sinon.stub()
            const branch2 = sinon.stub()
            const step3 = sinon.stub()
            // step1 -> branch1 -> step1 -> branch2 -> step3 -> branch2 -> step3 -> terminate
            step1.onFirstCall().returns({ nextState: { branch2: 'no' }, nextSteps: [branch1] })
            step1.onSecondCall().callsFake(() =>
                assertStepsPassthrough(controller, 1, 2, {
                    nextState: { branch1: 'no', branch2: 'no' },
                    nextSteps: [branch2],
                })
            )
            branch1.returns(undefined)
            branch2.callsFake(state =>
                assertStepsPassthrough(controller, 2, 3, { nextState: { branch2: 'yes', branch1: state.branch1 } })
            )
            step3.onFirstCall().returns(undefined)
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
