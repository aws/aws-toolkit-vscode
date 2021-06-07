/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StateMachineController, StateMachineControl } from '../../../shared/wizards/stateController'

function assertSteps<T>(controller: StateMachineController<T>, current: number, total: number): void {
    assert.strictEqual(controller.currentStep, current)
    assert.strictEqual(controller.totalSteps, total)
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

    it('can exit mid-run', async function() {
        const controller = new StateMachineController<number>()
        const step1 = sinon.stub()
        const step2 = sinon.stub()
        const step3 = sinon.stub()
        step1.returns(0)
        step2.returns({ controlSignal: StateMachineControl.Exit })
        step3.returns(1)
        controller.addStep(step1)
        controller.addStep(step2)
        controller.addStep(step3)

        assert.strictEqual(await controller.run(), undefined, 'State machine did not exit with an undefined state')
        assert.strictEqual(step3.called, false, 'The third step should not be called')
    })

    it('detects cycle', async function() {
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

    it('can add the same function as a step multiple times', async function() {
        const controller = new StateMachineController<number>()
        const step1 = sinon.stub()
        step1.onFirstCall().returns(0)
        step1.onSecondCall().returns(1)
        controller.addStep(step1)
        controller.addStep(step1)

        assert.strictEqual(await controller.run(), 1)
    })


    describe('retry', function () {
        it('repeats current step', async function () {
            const controller = new StateMachineController()
            const stub = sinon.stub()
            stub.onFirstCall().returns({ controlSignal: StateMachineControl.Retry })
            stub.onSecondCall().returns({})
            controller.addStep(stub)

            await controller.run()

            assert.strictEqual(stub.callCount, 2)
        })

        it('does not remember state on retry', async function () {
            const controller = new StateMachineController<{ answer: boolean }>()
            const stub = sinon.stub()
            stub.onFirstCall().returns({ nextState: { answer: true }, controlSignal: StateMachineControl.Retry })
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
            branchStep1.callsFake(state => { 
                assertSteps(controller, 2, 3)
                return state
            })
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
            branch1Step1.callsFake(state => {
                assertSteps(controller, 2, 4)
                return state
            })
            branch1Step2.returns({ nextState: {}, nextSteps: [branch2] })
            branch2.callsFake(state => {
                assertSteps(controller, 4, 5)
                return state
            })
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

        it('states are presereved between steps', async function () {
            const controller = new StateMachineController<{ answer: boolean }>()
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.onFirstCall().returns({ answer: false })
            step2.onFirstCall().returns(undefined)
            step1.onSecondCall().callsFake(state => {
                assert.strictEqual(state.answer, undefined)
                assertSteps(controller, 1, 2)
                return { nextState: { answer: true } }
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
                return { nextState: { branch1: 'no', branch2: 'no' }, nextSteps: [branch2] } 
            })
            branch1.returns(undefined)
            branch2.callsFake(state => {
                assertSteps(controller, 2, 3)
                return { nextState: { branch2: 'yes', branch1: state.branch1 } }
            })
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