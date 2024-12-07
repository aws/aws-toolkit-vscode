/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Prompter, PromptResult } from '../../../shared/ui/prompter'
import {
    isWizardControl,
    StateWithCache,
    StepEstimator,
    Wizard,
    WizardState,
    WIZARD_BACK,
    WIZARD_EXIT,
} from '../../../shared/wizards/wizard'
import { SkipPrompter } from '../../../shared/ui/common/skipPrompter'

interface TestWizardForm {
    prop1: string
    prop2?: number
    prop3: string
    prop4: string
    nestedProp: {
        prop1: string
        prop2?: boolean
    }
}

interface AssertStepMethods {
    /** Order is 1-indexed, e.g. onCall(1) === onFirstCall() */
    onCall(...order: number[]): void
    onFirstCall(): void
    onSecondCall(): void
    onThirdCall(): void
    onFourthCall(): void
    onEveryCall(): void
}

type StepTuple = [current: number, total: number]
type StateResponse<T, S> = (state: StateWithCache<S, T>) => PromptResult<T>
type TestResponse<T, S> = PromptResult<T> | StateResponse<T, S>

function makeGreen(s: string): string {
    return `\u001b[32m${s}\u001b[0m`
}

function makeExpectedError(message: string, actual: any, expected: any): string {
    return `${message}\n\tActual: ${actual}\n\t${makeGreen(`Expected: ${expected}`)}`
}

// TODO: rewrite this prompter to be a 'provider' type

/**
 * Note: This class should be used within this test file. Use 'FormTester' instead for testing wizard implementations since
 * it can test behavior irrespective of prompter ordering.
 *
 * Test prompters are instantiated with a finite set of responses. Responses can be raw data or functions applied to the
 * current state of the wizard. A developer-friendly name can be added using 'setName'.
 */
class TestPrompter<T, S = any> extends Prompter<T> {
    private readonly responses: TestResponse<T, S>[]
    private readonly acceptedStates: StateWithCache<S, T>[] = []
    private readonly acceptedSteps: [current: number, total: number][] = []
    private readonly acceptedEstimators: StepEstimator<T>[] = []
    private _totalSteps: number = 1
    private _lastResponse: PromptResult<T>
    private promptCount: number = 0
    private name: string = 'Test Prompter'

    public get recentItem(): PromptResult<T> {
        return this._lastResponse
    }
    public set recentItem(response: PromptResult<T>) {
        if (response !== this._lastResponse) {
            this.fail(
                makeExpectedError('Received unexpected cached response from wizard', response, this._lastResponse)
            )
        }
    }

    public override get totalSteps(): number {
        return this._totalSteps
    }

    constructor(...responses: TestResponse<T, S>[]) {
        super()
        this.responses = responses
    }

    public override async prompt(): Promise<PromptResult<T>> {
        if (this.responses.length === this.promptCount) {
            this.fail('Ran out of responses')
        }
        const resp = this.convertFunctionResponse(this.promptCount++)
        this._lastResponse = !isWizardControl(resp) ? resp : this._lastResponse

        return resp
    }

    protected promptUser(): Promise<PromptResult<T>> {
        throw new Error('Do not call this')
    }

    public setSteps(current: number, total: number): void {
        this.acceptedSteps.push([current, total])
    }

    public setStepEstimator(estimator: StepEstimator<T>): void {
        this.acceptedEstimators.push(estimator)
    }

    // ----------------------------Test helper methods go below this line----------------------------//

    public acceptState(state: StateWithCache<S, T>): this {
        this.acceptedStates[this.promptCount] = state
        return this
    }

    private fail(message: string): void {
        assert.fail(this.makeErrorMessage(message))
    }

    private makeErrorMessage(message: string): string {
        return `[${this.name}]: ${message}`
    }

    public setName(name: string): this {
        this.name = name
        return this
    }

    public setTotalSteps(total: number): void {
        this._totalSteps = total
    }

    private convertFunctionResponse(count: number = this.promptCount): PromptResult<T> {
        let response = this.responses[count]
        if (typeof response === 'function') {
            if (this.acceptedStates[count] === undefined) {
                this.fail(`Undefined state, did you forget to bind the prompter with "acceptState"?`)
            }
            response = (response as StateResponse<T, S>)(this.acceptedStates[count])
        }
        return response
    }

    private checkEstimate(input: T, expected: number, when: number): void {
        if (when > this.acceptedEstimators.length) {
            this.fail('Cannot check estimate for a step that did not occur')
        }

        const estimator = this.acceptedEstimators[when - 1]
        const actual = estimator(input)

        if (actual !== expected) {
            this.fail(makeExpectedError(`Estimator did not provide the expected steps: `, actual, expected))
        }
    }

    public assertStepEstimate(input: T, expected: number): AssertStepMethods {
        return {
            onCall: (...order: number[]) => order.forEach((i) => this.checkEstimate(input, expected, i)),
            onFirstCall: () => this.checkEstimate(input, expected, 1),
            onSecondCall: () => this.checkEstimate(input, expected, 2),
            onThirdCall: () => this.checkEstimate(input, expected, 3),
            onFourthCall: () => this.checkEstimate(input, expected, 4),
            onEveryCall: () => this.acceptedStates.forEach((_, i) => this.checkEstimate(input, expected, i + 1)),
        } as AssertStepMethods
    }

    private checkSteps(expected: StepTuple, when: number): void {
        if (when > this.acceptedSteps.length) {
            this.fail(`Cannot check step counts for a step that did not occur`)
        }

        const actual = this.acceptedSteps[when - 1]

        if (expected !== undefined) {
            assert.strictEqual(actual[0], expected[0], this.makeErrorMessage('Incorrect current step'))
            assert.strictEqual(actual[1], expected[1], this.makeErrorMessage('Incorrect total steps'))
        }
    }

    /** Check if the prompter was given the expected steps */
    public assertSteps(current: number, total: number): AssertStepMethods {
        return {
            onCall: (...order: number[]) => order.forEach((i) => this.checkSteps([current, total], i)),
            onFirstCall: () => this.checkSteps([current, total], 1),
            onSecondCall: () => this.checkSteps([current, total], 2),
            onThirdCall: () => this.checkSteps([current, total], 3),
            onFourthCall: () => this.checkSteps([current, total], 4),
            onEveryCall: () => this.acceptedSteps.forEach((_, i) => this.checkSteps([current, total], i + 1)),
        } as AssertStepMethods
    }

    public assertCallCount(count: number): void {
        assert.strictEqual(this.promptCount, count, this.makeErrorMessage('Called an unexpected number of times'))
    }
}

// We only need to test execution of prompters provided by the wizard form
describe('Wizard', function () {
    let wizard: Wizard<TestWizardForm>
    let helloPrompter: TestPrompter<string>

    beforeEach(function () {
        wizard = new Wizard()
        helloPrompter = new TestPrompter(...Array(100).fill('hello')).setName('Hello')
    })

    it('binds prompter to (sync AND async) property', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter)
        wizard.form.prop3.bindPrompter(async () => new SkipPrompter('helloooo (async)'))

        const result = await wizard.run()
        assert.strictEqual(result?.prop1, 'hello')
        assert.strictEqual(result?.prop3, 'helloooo (async)')
    })

    it('initializes state to empty object if not provided', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter, { showWhen: (state) => state !== undefined })

        assert.strictEqual((await wizard.run())?.prop1, 'hello')
    })

    it('processes exit signal', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter)
        wizard.form.prop3.bindPrompter(() => new TestPrompter<string>(WIZARD_EXIT).setName('Exit'))

        assert.strictEqual(await wizard.run(), undefined)
        helloPrompter.assertCallCount(1)
    })

    it('users exit prompter if provided', async function () {
        const checkForHello = (state: TestWizardForm) => state.prop1 !== 'hello'
        const exitPrompter = new TestPrompter(checkForHello, true).setName('Exit Dialog')
        const exitSignalPrompter = new TestPrompter<string>(WIZARD_EXIT, WIZARD_EXIT).setName('Exit Signal')
        wizard = new Wizard({ exitPrompterProvider: (state) => exitPrompter.acceptState(state as any) })
        wizard.form.prop1.bindPrompter(() => helloPrompter)
        wizard.form.prop3.bindPrompter(() => exitSignalPrompter)

        assert.strictEqual(await wizard.run(), undefined)
        helloPrompter.assertCallCount(1)
        exitPrompter.assertCallCount(2)
        exitSignalPrompter.assertCallCount(2)
    })

    // test is mostly redundant (state controller handles this logic) but good to have
    it('regenerates prompters when going back', async function () {
        const testPrompter = new TestPrompter(WIZARD_BACK, 'goodbye').setName('Goodbye')

        wizard.form.prop1.bindPrompter(() => helloPrompter)
        wizard.form.prop3.bindPrompter(() => testPrompter)

        assert.deepStrictEqual(await wizard.run(), { prop1: 'hello', prop3: 'goodbye' })
        helloPrompter.assertCallCount(2)
        testPrompter.assertCallCount(2)
    })

    it('applies step offset', async function () {
        const testPrompter = new TestPrompter('1')
        wizard.stepOffset = [4, 5]

        wizard.form.prop1.bindPrompter(() => testPrompter)

        assert.deepStrictEqual(await wizard.run(), { prop1: '1' })
        testPrompter.assertSteps(5, 6).onFirstCall()
    })

    it('provides a step estimator', async function () {
        const firstStep = new TestPrompter('0')
        const secondStep = new TestPrompter('1')

        wizard.form.prop1.bindPrompter((state) => firstStep.acceptState(state))
        wizard.form.prop3.bindPrompter(() => secondStep, { showWhen: (state) => state.prop1 === '1' })

        assert.deepStrictEqual(await wizard.run(), { prop1: '0' })
        firstStep.assertStepEstimate('0', 0).onFirstCall()
        firstStep.assertStepEstimate('1', 1).onFirstCall()
    })

    it('uses a parent estimator if provided', async function () {
        const parentEstimator = (state: TestWizardForm) => (state.prop1 === '1' ? (state.prop3 === '1' ? 2 : 1) : 0)
        const firstStep = new TestPrompter('1', '0', '1')
        const secondStep = new TestPrompter<string>(WIZARD_BACK, '1')
        const thirdStep = new TestPrompter(WIZARD_BACK, 1)

        wizard.parentEstimator = parentEstimator
        wizard.form.prop1.bindPrompter((state) => firstStep.acceptState(state))
        wizard.form.prop3.bindPrompter((state) => secondStep.acceptState(state), {
            showWhen: (state) => state.prop1 === '1',
        })
        wizard.form.prop2.bindPrompter((state) => thirdStep.acceptState(state))

        assert.deepStrictEqual(await wizard.run(), { prop1: '1', prop2: 1, prop3: '1' })
        firstStep.assertStepEstimate('0', 0).onEveryCall()
        secondStep.assertStepEstimate('1', 2).onSecondCall()
    })

    it('does not apply control values to state when going back', async function () {
        const noWizardControl = (state: StateWithCache<WizardState<TestWizardForm>, string>) => {
            assert.strictEqual(
                isWizardControl(state.prop2),
                false,
                'Wizard flow control should not appear in wizard state'
            )
            return 'good'
        }

        const testPrompter1 = new TestPrompter('first', noWizardControl).setName('Test 1')
        const testPrompter2 = new TestPrompter(WIZARD_BACK, 22).setName('Test 2')

        wizard.form.prop1.bindPrompter((state) => testPrompter1.acceptState(state))
        wizard.form.prop2.bindPrompter(() => testPrompter2)

        assert.deepStrictEqual(await wizard.run(), { prop1: 'good', prop2: 22 })
    })

    describe('prompter state', function () {
        // Execution order: 1 -> 2 -> 1 -> 2
        it('accurately assigns current/total steps', async function () {
            const testPrompter1 = new TestPrompter('1', '2', '3').setName('Test 1')
            const testPrompter2 = new TestPrompter(WIZARD_BACK, 4).setName('Test 2')

            testPrompter1.setTotalSteps(2)

            wizard.form.prop1.bindPrompter(() => testPrompter1)
            wizard.form.prop2.bindPrompter(() => testPrompter2)

            assert.deepStrictEqual(await wizard.run(), { prop1: '2', prop2: 4 })
            testPrompter1.assertCallCount(2)
            testPrompter2.assertCallCount(2)
            testPrompter1.assertSteps(1, 2).onFirstCall()
            testPrompter2.assertSteps(3, 3).onSecondCall()
        })

        //       A --> Path 1
        //      /             \
        // Start               End
        //      \             /
        //       B --> Path 2
        //
        // Execution order:
        // Start -> Path 1 -> End -> Path 1 -> Start -> Path 2 -> Start -> Path 1 -> Start -> Path 2 -> End -> Path 2 -> End
        it('sets total steps correctly when branching', async function () {
            const helloFunction = (state: WizardState<TestWizardForm>) =>
                state.prop1 === 'B' ? `hello ${state.prop3}` : `extra step`
            const testPrompterStart = new TestPrompter('A', 'B', 'A', 'B').setName('Start')
            const testPrompterPath1 = new TestPrompter(99, WIZARD_BACK, WIZARD_BACK, 10).setName('Path 1')
            const testPrompterPath2 = new TestPrompter(WIZARD_BACK, 'alice', 'bob').setName('Path 2')
            const testPrompterEnd = new TestPrompter(WIZARD_BACK, WIZARD_BACK, helloFunction).setName('End')

            testPrompterPath1.setTotalSteps(2)
            testPrompterPath2.setTotalSteps(3)

            wizard.form.prop1.bindPrompter(() => testPrompterStart)
            wizard.form.prop2.bindPrompter(() => testPrompterPath1, { showWhen: (state) => state.prop1 === 'A' })
            wizard.form.prop3.bindPrompter(() => testPrompterPath2, { showWhen: (state) => state.prop1 === 'B' })
            wizard.form.prop4.bindPrompter((state) => testPrompterEnd.acceptState(state))

            assert.deepStrictEqual(await wizard.run(), { prop1: 'B', prop3: 'bob', prop4: 'hello bob' })
            testPrompterStart.assertCallCount(4)
            testPrompterPath1.assertCallCount(3)
            testPrompterPath2.assertCallCount(3)
            testPrompterEnd.assertCallCount(3)
            testPrompterStart.assertSteps(1, 2).onEveryCall()
            testPrompterPath1.assertSteps(2, 3).onEveryCall()
            testPrompterPath2.assertSteps(2, 3).onEveryCall()
            testPrompterEnd.assertSteps(4, 4).onFirstCall()
            testPrompterEnd.assertSteps(5, 5).onCall(2, 3)
        })
    })
})
