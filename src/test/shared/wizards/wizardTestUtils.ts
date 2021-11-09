/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as assert from 'assert'
import chalk from 'chalk'
import { ExpandWithObject } from '../../../shared/utilities/tsUtils'
import { isValidResponse, Wizard } from '../../../shared/wizards/wizard'
import { WizardForm } from '../../../shared/wizards/wizardForm'
import { QuickPickTester } from '../ui/testUtils'
import { QuickPickPrompter } from '../../../shared/ui/pickerPrompter'

interface MockWizardFormElement<TProp> {
    /** Directly assigns input to the property, skipping any prompt. */
    applyInput(input: TProp): void
    clearInput(): void
    /** Verifies the property would be shown. */
    assertShow(order?: number): void
    assertShowFirst(): void
    assertShowSecond(): void
    assertShowThird(): void
    assertShowAny(): void
    assertDoesNotShow(): void
    /** Verifies that no sub-properties of the target would show prompters. */
    assertDoesNotShowAny(): void
    assertValue(expected: TProp | undefined): void
    assertShowCount(count: number): void
    /**
     * Executes a UI tester against the next available prompt.
     *
     * Currently only `QuickPickTester` is supported. In the future `InputBox` can also be tested.
     */
    runPrompt(callback: PromptTester<TProp>): Promise<void>
}

interface TesterMethods {
    /**
     * Pretty-prints some info about the test state.
     *
     * Blue: state with a defined value. Non-default values will never be assigned.
     * Green: properties that would be shown in the given order.
     * Red: properties that would not be shown.
     */
    printInfo(): void
}

type PromptTester<T> = (prompter: QuickPickPrompter<T>) => QuickPickTester<T>

type MockForm<T, TState = T> = {
    [Property in keyof T]-?: T[Property] extends ExpandWithObject<T[Property]>
        ? MockForm<Required<T[Property]>, TState> & MockWizardFormElement<T[Property]>
        : MockWizardFormElement<T[Property]>
}

export type WizardTester<T> = T extends Wizard<infer U>
    ? WizardTester<U>
    : MockForm<Required<T>> & Pick<MockWizardFormElement<any>, 'assertShowCount'> & TesterMethods

export function createWizardTester<T extends Partial<T>>(wizard: Wizard<T> | WizardForm<T>): WizardTester<T> {
    const form = wizard instanceof Wizard ? wizard.boundForm : wizard
    const state = (wizard instanceof Wizard ? (wizard.initialState as T) : undefined) ?? ({} as T)
    let assigned: string[] = []
    let initialized: boolean = false

    function failIf(cond: boolean, message?: string): void {
        if (cond) {
            assert.fail(message)
        }
    }

    function canShowPrompter(prop: string, shown: Set<string> = new Set(assigned)): boolean {
        const defaultState = form.applyDefaults(state, shown)

        if (!form.canShowProperty(prop, state, shown, defaultState)) {
            return false
        }

        const provider = form.getPrompterProvider(prop)

        return provider !== undefined
    }

    function hasProp(prop: string): boolean {
        return assigned.indexOf(prop) !== -1
    }

    function showableChildren(parent: string): string[] {
        return assigned.filter(prop => prop !== parent && prop.startsWith(parent) && hasProp(prop))
    }

    function assertOrder(prop: string, expected: number): void {
        const order = assigned.indexOf(prop)

        failIf(order === -1, `Property "${prop}" would not be shown`)
        failIf(
            order !== expected - 1,
            `Property "${prop}" would be shown in the wrong order: ${order + 1} !== ${expected}`
        )
    }

    function assertShow(prop: string, expected?: number): MockWizardFormElement<T>['assertShow'] {
        return (order: number | undefined = expected) => {
            order === undefined
                ? failIf(!hasProp(prop), `Property "${prop}" would not be shown`)
                : assertOrder(prop, order)
        }
    }

    function assertShowNone(prop: string): MockWizardFormElement<T>['assertDoesNotShowAny'] {
        return () => {
            const children = showableChildren(prop)
            const message = children.map(p => p.replace(`${prop}.`, '')).join('\n\t')

            failIf(children.length !== 0, `Property "${prop}" would show the following:\n\t${message}`)
        }
    }

    function assertValue<TProp>(path: string): MockWizardFormElement<TProp>['assertValue'] {
        return (expected: TProp) => {
            const actual = _.get(form.applyDefaults(state, new Set(assigned)), path)
            failIf(actual !== expected, `Property "${path}" had unexpected value: ${actual} !== ${expected}`)
        }
    }

    function assertShowCount(): MockWizardFormElement<T>['assertShowCount'] {
        return (expected: number) => {
            const total = assigned.length
            assert.strictEqual(total, expected, 'Expected number of prompts were not shown.')
        }
    }

    function runPrompt<TProp>(prop: string, callback: PromptTester<TProp>): Promise<void> {
        failIf(assigned.length === 0, 'Cannot run a tester without an assigned prompt.')
        failIf(assigned[0] !== prop, `Can only test the next assigned prompt: ${assigned[0]}`)
        const provider = form.getPrompterProvider(assigned[0])
        failIf(!provider, 'Prompter binding returned undefined.')
        const defaults = form.applyDefaults(state, new Set(assigned))
        const prompter = provider!({ ...defaults, stepCache: {}, estimator: () => 0 })
        failIf(!(prompter instanceof QuickPickPrompter), 'Can only test QuickPickPrompters.')
        const tester = callback(prompter as QuickPickPrompter<TProp>)
        return tester.result().then(result => {
            failIf(!isValidResponse(result), 'Testing with control signals is not currently supported.')
            _.set(state, assigned[0], result)
            evaluate()
        })
    }

    // TODO: make this per-prop. No reason why we can't index the state
    function printInfo(logger = console.log): void {
        // TODO: be able to mark bad props (e.g. shown when not supposed to be)
        const log =
            (c: (a: string) => string) =>
            (p: string, s: string, ...meta: any[]) =>
                logger(c(`${p.padEnd(5)} ${s}`), ...meta)
        const defaults = form.applyDefaults(state, new Set(assigned))
        const score = (a: string) => {
            const unassignedScore =
                1000 - Number(_.get(state, a) !== undefined) * 2000 - Number(_.get(defaults, a) !== undefined) * 2000
            return assigned.indexOf(a) + 1 || unassignedScore
        }
        const props = form.properties.sort((a, b) => score(a) - score(b))
        for (const prop of props) {
            const stateVal = _.get(state, prop)
            const defaultVal = _.get(defaults, prop)
            const index = assigned.indexOf(prop)
            if (index !== -1) {
                log(chalk.green)(`${index + 1}`, prop)
            } else if (stateVal === undefined && defaultVal !== undefined) {
                log(chalk.blue)('-', `${prop} => %s ${chalk.yellow('(Default)')}`, JSON.stringify(defaultVal))
            } else if (stateVal !== undefined) {
                log(chalk.blue)('-', `${prop} => %s`, JSON.stringify(stateVal))
            } else {
                log(chalk.red)('X', prop)
            }
        }
    }

    function decorateMethods(obj: any): any {
        for (const prop of Object.keys(obj)) {
            if (prop === 'printInfo') {
                continue
            }
            const original = obj[prop]
            obj[prop] = (...args: any[]) => {
                try {
                    return original(...args)
                } catch (err) {
                    const error = err as Error
                    const logger = (s: string, ...meta: any[]) => {
                        // pretty bad logger...
                        error.message = `${error.message} \n${s.replace('%s', meta[0])}`
                    }
                    printInfo(logger)
                    throw error
                }
            }
        }
        return obj
    }

    /** Regenerates the dependency graph after binding elements to the form. */
    function evaluate(): void {
        assigned = []

        form.properties.forEach(prop => {
            if (canShowPrompter(prop)) {
                assigned.push(prop)
            }
        })
    }

    const createElement = (prop: string) =>
        decorateMethods({
            applyInput: <TProp>(input: TProp) => (_.set(state, prop, input), evaluate()),
            clearInput: () => (_.set(state, prop, undefined), evaluate()),
            assertShow: assertShow(prop),
            assertShowFirst: assertShow(prop, 1),
            assertShowSecond: assertShow(prop, 2),
            assertShowThird: assertShow(prop, 3),
            assertShowAny: () =>
                failIf(showableChildren(prop).length === 0, `No properties of "${prop}" would be shown`),
            assertDoesNotShow: () => failIf(hasProp(prop), `Property "${prop}" would be shown`),
            assertDoesNotShowAny: assertShowNone(prop),
            assertValue: assertValue(prop),
            assertShowCount: assertShowCount(),
            runPrompt: (callback: PromptTester<any>) => runPrompt(prop, callback),
            printInfo,
        }) as MockWizardFormElement<any>

    function createFormWrapper(path: string[] = []): WizardTester<T> {
        return new Proxy(
            {},
            {
                get: (obj, prop, rec) => {
                    if (!initialized) {
                        initialized = true
                        evaluate()
                    }

                    const propPath = path.join('.')
                    const element = createElement(propPath)

                    if (prop in element) {
                        return element[prop as keyof MockWizardFormElement<any>]
                    }

                    return Reflect.get(obj, prop, rec) ?? createFormWrapper([...path, prop.toString()])
                },
            }
        ) as WizardTester<T>
    }

    evaluate()

    return createFormWrapper()
}
