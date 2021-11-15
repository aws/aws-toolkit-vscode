/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Prompter, PrompterConfiguration, PromptResult } from '../../../shared/ui/prompter'
import { WizardControl } from '../../../shared/wizards/util'
import { StateWithCache, StepEstimator, Wizard } from '../../../shared/wizards/wizard'
import { BoundState } from '../../../shared/wizards/wizardForm'

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
type TestResponse<T, S> = Promise<PromptResult<T>> | PromptResult<T> | StateResponse<T, S>

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
    private _disposed: boolean = false
    private _lastResponse?: PromptResult<T>

    private promptCount: number = 0
    private name: string = 'Test Prompter'

    public get recentItem(): PromptResult<T> {
        assert.ok(this._lastResponse, 'Tried accessing `recentItem` before prompting')
        return this._lastResponse
    }
    public set recentItem(response: PromptResult<T>) {
        if (response !== this._lastResponse) {
            this.fail(
                makeExpectedError('Received unexpected cached response from wizard', response, this._lastResponse)
            )
        }
    }

    public get totalSteps(): number {
        return this._totalSteps
    }

    constructor(...responses: TestResponse<T, S>[]) {
        super()
        this.responses = responses
    }

    public async prompt(): Promise<T | undefined> {
        throw new Error('Wizards should not call this method')
    }

    public async promptControl(config: PrompterConfiguration<T>): Promise<PromptResult<T>> {
        config.steps && this.setSteps(config.steps.current, config.steps.total)
        config.stepEstimator && this.setStepEstimator(config.stepEstimator)

        if (this.responses.length === this.promptCount) {
            this.fail('Ran out of responses')
        }

        return (this._lastResponse = await this.convertFunctionResponse(this.promptCount++))
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

    public override dispose(): void {
        this._disposed = true
    }
    //----------------------------Test helper methods go below this line----------------------------//

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

    private convertFunctionResponse(count: number = this.promptCount): PromptResult<T> | Promise<PromptResult<T>> {
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
            onCall: (...order: number[]) => order.forEach(i => this.checkEstimate(input, expected, i)),
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
            onCall: (...order: number[]) => order.forEach(i => this.checkSteps([current, total], i)),
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

    public assertDisposed(): void {
        if (!this._disposed) {
            this.fail('Was not disposed')
        }
    }

    public assertNotDisposed(): void {
        if (this._disposed) {
            this.fail('Was disposed')
        }
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

    it('binds prompter to property', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter)

        assert.strictEqual((await wizard.run())?.prop1, 'hello')
    })

    it('initializes state to empty object if not provided', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter, { showWhen: state => state !== undefined })

        assert.strictEqual((await wizard.run())?.prop1, 'hello')
    })

    it('processes exit signal', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter)
        wizard.form.prop3.bindPrompter(() => new TestPrompter<string>(WizardControl.Exit).setName('Exit'))

        assert.strictEqual(await wizard.run(), undefined)
        helloPrompter.assertCallCount(1)
    })

    it('disposes of the last prompter if exiting the wizard', async function () {
        const exitPrompter = new TestPrompter<string>(WizardControl.Back).setName('Exit')
        wizard.form.prop1.bindPrompter(() => exitPrompter)

        assert.strictEqual(await wizard.run(), undefined)
        exitPrompter.assertDisposed()
    })

    // test is mostly redundant (state controller handles this logic) but good to have
    it('regenerates prompters when going back', async function () {
        const testPrompter = new TestPrompter(WizardControl.Back, 'goodbye').setName('Goodbye')

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

        wizard.form.prop1.bindPrompter(state => firstStep.acceptState(state))
        wizard.form.prop3.bindPrompter(() => secondStep, { showWhen: state => state.prop1 === '1' })

        assert.deepStrictEqual(await wizard.run(), { prop1: '0' })
        firstStep.assertStepEstimate('0', 0).onFirstCall()
        firstStep.assertStepEstimate('1', 1).onFirstCall()
    })

    it('uses a parent estimator if provided', async function () {
        const parentEstimator = (state: TestWizardForm) => (state.prop1 === '1' ? (state.prop3 === '1' ? 2 : 1) : 0)
        const firstStep = new TestPrompter('1', '0', '1')
        const secondStep = new TestPrompter<string>(WizardControl.Back, '1')
        const thirdStep = new TestPrompter(WizardControl.Back, 1)

        wizard.parentEstimator = parentEstimator
        wizard.form.prop1.bindPrompter(state => firstStep.acceptState(state))
        wizard.form.prop3.bindPrompter(state => secondStep.acceptState(state), {
            showWhen: state => state.prop1 === '1',
        })
        wizard.form.prop2.bindPrompter(state => thirdStep.acceptState(state))

        assert.deepStrictEqual(await wizard.run(), { prop1: '1', prop2: 1, prop3: '1' })
        firstStep.assertStepEstimate('0', 0).onEveryCall()
        secondStep.assertStepEstimate('1', 2).onSecondCall()
    })

    it('does not apply control values to state when going back', async function () {
        const noWizardControl = (state: StateWithCache<BoundState<TestWizardForm, []>, string>) => {
            assert.strictEqual(
                (state.prop2 as any) instanceof WizardControl,
                false,
                'Wizard flow control should not appear in wizard state'
            )
            return 'good'
        }

        const testPrompter1 = new TestPrompter('first', noWizardControl).setName('Test 1')
        const testPrompter2 = new TestPrompter(WizardControl.Back, 22).setName('Test 2')

        wizard.form.prop1.bindPrompter(state => testPrompter1.acceptState(state))
        wizard.form.prop2.bindPrompter(() => testPrompter2)

        assert.deepStrictEqual(await wizard.run(), { prop1: 'good', prop2: 22 })
    })

    describe('exitPrompter', function () {
        let exitPrompter: TestPrompter<boolean>
        let exitSignalPrompter: TestPrompter<string>

        beforeEach(function () {
            const checkForHello = (state: TestWizardForm) => state.prop1 !== 'hello'
            exitPrompter = new TestPrompter(checkForHello, true).setName('Exit Dialog')
            exitSignalPrompter = new TestPrompter<string>(WizardControl.Exit, WizardControl.Exit).setName('Exit Signal')
            wizard = new Wizard({ exitPrompter: state => exitPrompter.acceptState(state as any) })
            wizard.form.prop1.bindPrompter(() => helloPrompter)
            wizard.form.prop3.bindPrompter(() => exitSignalPrompter)
        })

        it('user exit prompter if provided', async function () {
            assert.strictEqual(await wizard.run(), undefined)
            helloPrompter.assertCallCount(1)
            exitPrompter.assertCallCount(2)
            exitSignalPrompter.assertCallCount(2)
        })

        it('disposes of exit prompter on exit', async function () {
            assert.strictEqual(await wizard.run(), undefined)
            exitPrompter.assertDisposed()
        })
    })

    describe('cache', function () {
        it('throws if trying to access the cache while running', async function () {
            wizard.form.prop1.bindPrompter(() => new TestPrompter<string>(Promise.resolve('test')))
            wizard.run()
            assert.throws(() => wizard.cache)
            assert.throws(() => (wizard.cache = {}))
        })

        // Expected behavior
        //
        // First run: prop1 -> prop3
        // Cache now contains "hello" for prop1 and "goodbye" for prop3
        //
        // Second run: prop3 -> prop1 -> prop3
        // The `Goodbye` prompter receives "goodbye" as a recent item, then presses back because "hello" was the last response
        // `Hello` prompter responds "hello"
        // `Goodbye` prompter uses the `Hello` prompter's response as a result
        //
        // This test is meant to be somewhat contrived and is more of a smoke test than anything else
        it('can use cache to reconstruct internal state, showing the last step', async function () {
            const reuseState = (back: boolean) => (state: BoundState<TestWizardForm, []>) =>
                state.prop1 === 'hello' ? (back ? WizardControl.Back : 'hello') : 'unknown'
            const testPrompter = new TestPrompter('goodbye', reuseState(true), reuseState(false)).setName('Goodbye')

            wizard.form.prop1.bindPrompter(() => helloPrompter)
            wizard.form.prop3.bindPrompter(state => testPrompter.acceptState(state))

            assert.deepStrictEqual(await wizard.run(), { prop1: 'hello', prop3: 'goodbye' })
            const cache = wizard.cache

            wizard = new Wizard()
            wizard.stepOffset = [1, 1] // Covers the 'nested wizard' case
            wizard.form.prop1.bindPrompter(() => helloPrompter)
            wizard.form.prop3.bindPrompter(state => testPrompter.acceptState(state))
            wizard.cache = cache

            assert.deepStrictEqual(await wizard.run(), { prop1: 'hello', prop3: 'hello' })
            helloPrompter.assertCallCount(2)
            testPrompter.assertCallCount(3)
        })
    })

    describe('prompter state', function () {
        // Execution order: 1 -> 2 -> 1 -> 2
        it('accurately assigns current/total steps', async function () {
            const testPrompter1 = new TestPrompter('1', '2', '3').setName('Test 1')
            const testPrompter2 = new TestPrompter(WizardControl.Back, 4).setName('Test 2')

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
        // Path 1 is treated as being two steps
        // Path 2 is treated as being three steps
        it('sets total steps correctly when branching', async function () {
            const helloFunction = (state: BoundState<TestWizardForm, []>) =>
                state.prop1 === 'B' ? `hello ${state.prop3}` : `extra step`
            const testPrompterStart = new TestPrompter('A', 'B', 'A', 'B').setName('Start')
            const testPrompterPath1 = new TestPrompter(99, WizardControl.Back, WizardControl.Back, 10).setName('Path 1')
            const testPrompterPath2 = new TestPrompter(WizardControl.Back, 'alice', 'bob').setName('Path 2')
            const testPrompterEnd = new TestPrompter(WizardControl.Back, WizardControl.Back, helloFunction).setName(
                'End'
            )

            testPrompterPath1.setTotalSteps(2)
            testPrompterPath2.setTotalSteps(3)

            wizard.form.prop1.bindPrompter(() => testPrompterStart)
            wizard.form.prop2.bindPrompter(() => testPrompterPath1, { showWhen: state => state.prop1 === 'A' })
            wizard.form.prop3.bindPrompter(() => testPrompterPath2, { showWhen: state => state.prop1 === 'B' })
            wizard.form.prop4.bindPrompter(state => testPrompterEnd.acceptState(state))

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
