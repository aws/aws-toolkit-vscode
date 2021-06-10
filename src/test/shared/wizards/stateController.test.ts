/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StateMachineController, ControlSignal, StepResult, Branch } from '../../../shared/wizards/stateController'

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

interface PrimeGenerator {
    primes: number[]
    stopAt: number
    current: {
        value: number
        counter?: number
        isPrime?: boolean
    }
}

/** Finds all primes up to 'stopAt' starting at 'current.value' */
async function primeGen(state: PrimeGenerator): Promise<StepResult<PrimeGenerator>> {
    const nextSteps: Branch<PrimeGenerator> = []

    state.current.value += 1
    nextSteps.push(checkPrime, addIfPrime)

    if (state.current.value < state.stopAt) {
        nextSteps.push(primeGen)
    }

    return { nextState: state, nextSteps }
}

// 6k + 1 primality test
async function checkPrime(state: PrimeGenerator): Promise<StepResult<PrimeGenerator>> {
    state.current.counter = state.current.counter ?? 5
    const val = state.current.value
    state.current.isPrime = val !== 0

    if (val % 2 === 0 || val % 3 === 0) {
        state.current.isPrime = false
    } else {
        const counter = state.current.counter
        if (counter * counter <= val) {
            if (val % counter === 0 || val % (counter + 2) === 0) {
                state.current.isPrime = false
                state.current.counter = undefined
            } else {
                state.current.counter += 6
                return { nextState: state, nextSteps: [checkPrime] }
            }
        } else {
            state.current.counter = undefined
        }
    }

    return { nextState: state }
}

async function addIfPrime(state: PrimeGenerator): Promise<StepResult<PrimeGenerator>> {
    if (state.current.isPrime) {
        state.primes.push(state.current.value!)
    }

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

    it('can exit mid-run', async function() {
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
            stub.onFirstCall().returns({ controlSignal: ControlSignal.Retry })
            stub.onSecondCall().returns({})
            controller.addStep(stub)

            await controller.run()

            assert.strictEqual(stub.callCount, 2)
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

        it('states are presereved between steps', async function () {
            const controller = new StateMachineController<{ answer: boolean }>()
            const step1 = sinon.stub()
            const step2 = sinon.stub()
            step1.onFirstCall().returns({ answer: false })
            step2.onFirstCall().returns(undefined)
            step1.onSecondCall().callsFake(state => {
                assert.strictEqual(state.answer, undefined)
                return assertStepsPassthrough(controller, 1, 2, { nextState: { answer: true } })
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
            step1.onSecondCall().callsFake(() => 
                assertStepsPassthrough(controller, 1, 2, { nextState: { branch1: 'no', branch2: 'no' }, nextSteps: [branch2] } )
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

    describe('can run complex state machines', async function () {
        it('generate all primes from 0 to 100', async function () {
            const controller = new StateMachineController<PrimeGenerator>({ stopAt: 100, primes: [], current: { value: 0 } })
            controller.addStep(primeGen)
            const result = await controller.run()
            assert.deepStrictEqual(result?.primes, 
                [1, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97])
        })
    })
})