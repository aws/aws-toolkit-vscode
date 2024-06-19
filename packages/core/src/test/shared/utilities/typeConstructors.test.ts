/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    addTypeName,
    ArrayConstructor,
    cast,
    getTypeName,
    Optional,
    TypeConstructor,
} from '../../../shared/utilities/typeConstructors'

describe('Type Constructors', function () {
    /**
     * Omitting the `expected` field implies that the input is the expected output.
     */
    interface Scenario<T = any> {
        readonly input: any
        readonly type: TypeConstructor<T>
        readonly expected?: T | assert.AssertPredicate
    }

    type GroupedScenarios = { [type: string]: { readonly accepts: Scenario[]; readonly rejects: Scenario[] } }
    function groupScenarios(scenarios: Scenario[]): Readonly<GroupedScenarios> {
        const grouped: GroupedScenarios = {}

        for (const scenario of scenarios) {
            const group = (grouped[getTypeName(scenario.type)] ??= { accepts: [], rejects: [] })
            const isFailureCase = scenario.expected instanceof Error || typeof scenario.expected === 'function'

            if (isFailureCase) {
                group.rejects.push(scenario)
            } else {
                group.accepts.push(scenario)
            }
        }

        return grouped
    }

    function setup(): { readonly scenarios: Scenario[]; addScenario<T>(scenario: Scenario<T>): void } {
        const scenarios = [] as Scenario[]

        return {
            get scenarios() {
                return scenarios
            },
            addScenario(scenario) {
                this.scenarios.push(scenario)
            },
        }
    }

    describe('validation', function () {
        const tests = setup()

        // Could make this a n x n matrix. Valid cases would be along the diagonal
        tests.addScenario({ type: String, input: '' })
        tests.addScenario({ type: String, input: 'foo' })
        tests.addScenario({ type: String, input: '123' })
        tests.addScenario({ type: String, input: undefined, expected: TypeError })
        tests.addScenario({ type: String, input: 123, expected: TypeError })
        tests.addScenario({ type: String, input: false, expected: TypeError })
        tests.addScenario({ type: String, input: ['foo'], expected: TypeError })
        tests.addScenario({ type: String, input: { foo: 'foo' }, expected: TypeError })

        tests.addScenario({ type: Boolean, input: true })
        tests.addScenario({ type: Boolean, input: false })
        tests.addScenario({ type: Boolean, input: 'foo', expected: TypeError })
        tests.addScenario({ type: Boolean, input: 'true', expected: TypeError })
        tests.addScenario({ type: Boolean, input: 'false', expected: TypeError })
        tests.addScenario({ type: Boolean, input: 0, expected: TypeError })
        tests.addScenario({ type: Boolean, input: 1, expected: TypeError })
        tests.addScenario({ type: Boolean, input: undefined, expected: TypeError })

        tests.addScenario({ type: Number, input: 0 })
        tests.addScenario({ type: Number, input: -123123.90283 })
        tests.addScenario({ type: Number, input: 9999999999 })
        tests.addScenario({ type: Number, input: '9999999999', expected: TypeError })
        tests.addScenario({ type: Number, input: 'foo', expected: TypeError })
        tests.addScenario({ type: Number, input: { bar: 'bar' }, expected: TypeError })
        tests.addScenario({ type: Number, input: false, expected: TypeError })
        tests.addScenario({ type: Number, input: true, expected: TypeError })

        tests.addScenario({ type: Object, input: { foo: 'bar' } })
        tests.addScenario({ type: Object, input: [] })
        tests.addScenario({ type: Object, input: 'bar', expected: TypeError })
        tests.addScenario({ type: Object, input: true, expected: TypeError })

        tests.addScenario({ type: ArrayConstructor(String), input: ['a', 'b'] })
        tests.addScenario({ type: ArrayConstructor(String), input: ['a', 0], expected: TypeError })
        tests.addScenario({ type: ArrayConstructor(String), input: 'a', expected: TypeError })
        tests.addScenario({ type: ArrayConstructor(Number), input: [1, 2, 3] })
        tests.addScenario({ type: ArrayConstructor(Number), input: [1, true, 3], expected: TypeError })
        tests.addScenario({ type: ArrayConstructor(Number), input: [1, 2, '3'], expected: TypeError })
        tests.addScenario({ type: ArrayConstructor(Number), input: '[1, 2, 3]', expected: TypeError })

        tests.addScenario({ type: Optional(String), input: undefined })
        tests.addScenario({ type: Optional(String), input: 'foo' })
        tests.addScenario({ type: Optional(String), input: 123, expected: TypeError })

        for (const [typeName, group] of Object.entries(groupScenarios(tests.scenarios))) {
            describe(typeName, function () {
                const formatTitle = (prefix: string, input: unknown) =>
                    `${prefix}: ${input === undefined ? 'undefined' : JSON.stringify(input)}`

                for (const scenario of group.accepts) {
                    it(formatTitle('accepts', scenario.input), () => {
                        assert.deepStrictEqual(cast(scenario.input, scenario.type), scenario.expected ?? scenario.input)
                    })
                }

                for (const scenario of group.rejects) {
                    it(formatTitle('rejects', scenario.input), () => {
                        assert.throws(() => cast(scenario.input, scenario.type), scenario.expected)
                    })
                }
            })
        }
    })

    describe('functions', function () {
        it('can use functions', function () {
            function asBar(input: unknown): 'bar' {
                if (typeof input === 'string' && input === 'bar') {
                    return input
                }

                throw new TypeError('Input was not "bar"')
            }

            assert.strictEqual(cast('bar', asBar), 'bar')
            assert.throws(() => cast('foo', asBar), TypeError)
        })

        it('can use anonymous functions', function () {
            const makeCast = (value: unknown) => () =>
                cast(value, (input): asserts input is true => assert.strictEqual(input, true))

            assert.strictEqual(makeCast(true)(), true)
            assert.throws(makeCast(false), /to \[Anonymous Type\]/)
            assert.throws(makeCast('foo'), /to \[Anonymous Type\]/)
            assert.throws(makeCast(undefined), /to \[Anonymous Type\]/)
        })

        it('uses names attached to functions', function () {
            const typeName = 'Literal<"foo">'
            const asFoo = addTypeName(typeName, input => {
                if (typeof input === 'string' && input === 'foo') {
                    return input as 'foo'
                }

                throw new TypeError('Input was not "foo"')
            })

            assert.strictEqual(cast('foo', asFoo), 'foo')
            assert.throws(() => cast(true, asFoo), new RegExp(`to ${typeName}`))
            assert.throws(() => cast('bar', asFoo), new RegExp(`to ${typeName}`))
        })
    })
})
