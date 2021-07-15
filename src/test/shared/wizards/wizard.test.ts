/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Prompter, PromptResult } from '../../../shared/ui/prompter'
import { isWizardControl, Wizard, WizardState, WIZARD_BACK, WIZARD_EXIT } from '../../../shared/wizards/wizard'

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

type StepTuple = [number, number]
type StateResponse<T, S> = (state: WizardState<S>) => PromptResult<T>
type TestResponse<T, S> = PromptResult<T> | StateResponse<T, S>

function makeGreen(s: string): string {
    return `\u001b[32m${s}\u001b[0m`
}

function makeExpectedError(message: string, actual: any, expected: any): string {
    return `${message}\n\tActual: ${actual}\n\t${makeGreen(`Expected: ${expected}`)}`
}

/**
 * Note: This class should be used within this test file. Use 'FormTester' instead for testing wizard implementations since
 * it can test behavior irrespective of prompter ordering.
 *
 * Test prompters are instantiated with a finite set of responses. Responses can be raw data or functions applied to the
 * current state of the wizard. A developer-friendly name can be added using 'setName'.
 */
class TestPrompter<T, S = any> extends Prompter<T> {
    private readonly responses: TestResponse<T, S>[]
    private readonly order: Map<number, StepTuple> = new Map()
    private readonly acceptedStates: WizardState<S>[] = []
    private _totalSteps: number = 1
    private _lastResponse: PromptResult<T>
    private promptCount: number = 0
    private name: string = 'Test Prompter'

    public get lastResponse(): PromptResult<T> {
        return this._lastResponse
    }
    public set lastResponse(response: PromptResult<T>) {
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

    public async prompt(): Promise<PromptResult<T>> {
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
        const expected = this.order.get(this.promptCount)

        if (expected !== undefined) {
            assert.strictEqual(current, expected[0], this.makeErrorMessage('Incorrect current step'))
            assert.strictEqual(total, expected[1], this.makeErrorMessage('Incorrect total steps'))
        }
    }

    //----------------------------Test helper methods go below this line----------------------------//

    public acceptState(state: WizardState<S>): this {
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

    /** Checks steps during execution. This should be called _before_ running the wizard. */
    public assertSteps(current: number, total: number, when: number = 0): AssertStepMethods {
        return {
            onCall: (...order: number[]) => {
                order.map(i => this.order.set(i - 1, [current, total]))
            },
            onFirstCall: () => {
                this.order.set(0, [current, total])
            },
            onSecondCall: () => {
                this.order.set(1, [current, total])
            },
            onThirdCall: () => {
                this.order.set(2, [current, total])
            },
            onFourthCall: () => {
                this.order.set(3, [current, total])
            },
            onEveryCall: () => {
                ;[...Array(100).keys()].map(i => this.order.set(i, [current, total]))
            },
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

    it('binds prompter to property', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter)

        assert.strictEqual((await wizard.run())?.prop1, 'hello')
    })

    it('processes exit signal', async function () {
        wizard.form.prop1.bindPrompter(() => helloPrompter)
        wizard.form.prop3.bindPrompter(() => new TestPrompter<string>(WIZARD_EXIT).setName('Exit'))

        assert.strictEqual(await wizard.run(), undefined)
        helloPrompter.assertCallCount(1)
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
        wizard.stepOffset = 5

        wizard.form.prop1.bindPrompter(() => testPrompter)

        testPrompter.assertSteps(6, 6).onFirstCall()

        assert.deepStrictEqual(await wizard.run(), { prop1: '1' })
    })

    it('does not apply control values to state when going back', async function () {
        const noWizardControl = (state: WizardState<TestWizardForm>) => {
            assert.strictEqual(
                isWizardControl(state.prop2),
                false,
                'Wizard flow control should not appear in wizard state'
            )
            return 'good'
        }

        const testPrompter1 = new TestPrompter('first', noWizardControl).setName('Test 1')
        const testPrompter2 = new TestPrompter(WIZARD_BACK, 22).setName('Test 2')

        wizard.form.prop1.bindPrompter(state => testPrompter1.acceptState(state))
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

            testPrompter1.assertSteps(1, 2).onFirstCall()
            testPrompter2.assertSteps(3, 3).onSecondCall()

            assert.deepStrictEqual(await wizard.run(), { prop1: '2', prop2: 4 })
            testPrompter1.assertCallCount(2)
            testPrompter2.assertCallCount(2)
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
            wizard.form.prop2.bindPrompter(() => testPrompterPath1, { showWhen: state => state.prop1 === 'A' })
            wizard.form.prop3.bindPrompter(() => testPrompterPath2, { showWhen: state => state.prop1 === 'B' })
            wizard.form.prop4.bindPrompter(state => testPrompterEnd.acceptState(state))

            testPrompterStart.assertSteps(1, 2).onEveryCall()
            testPrompterPath1.assertSteps(2, 3).onEveryCall()
            testPrompterPath2.assertSteps(2, 3).onEveryCall()
            testPrompterEnd.assertSteps(4, 4).onFirstCall()
            testPrompterEnd.assertSteps(5, 5).onCall(2, 3)

            assert.deepStrictEqual(await wizard.run(), { prop1: 'B', prop3: 'bob', prop4: 'hello bob' })
            testPrompterStart.assertCallCount(4)
            testPrompterPath1.assertCallCount(3)
            testPrompterPath2.assertCallCount(3)
            testPrompterEnd.assertCallCount(3)
        })
    })
})
