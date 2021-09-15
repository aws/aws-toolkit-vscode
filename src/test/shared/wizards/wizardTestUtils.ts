/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as assert from 'assert'
import { ExpandWithObject } from '../../../shared/utilities/tsUtils'
import { Wizard } from '../../../shared/wizards/wizard'
import { WizardForm } from '../../../shared/wizards/wizardForm'

interface MockWizardFormElement<TProp> {
    applyInput(input: TProp): void
    clearInput(): void
    /**
     * Verifies the property would be shown.
     */
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
}

type MockForm<T, TState = T> = {
    [Property in keyof T]-?: T[Property] extends ExpandWithObject<T[Property]>
        ? MockForm<Required<T[Property]>, TState> & MockWizardFormElement<T[Property]>
        : MockWizardFormElement<T[Property]>
}

export type WizardTester<T> = MockForm<Required<T>> & Pick<MockWizardFormElement<any>, 'assertShowCount'>

function failIf(cond: boolean, message?: string): void {
    if (cond) {
        assert.fail(message)
    }
}

export function createWizardTester<T extends Partial<T>>(wizard: Wizard<T> | WizardForm<T>): WizardTester<T> {
    const form = wizard instanceof Wizard ? wizard.boundForm : wizard
    const state = {} as T
    let assigned: string[] = []
    let initialized: boolean = false

    function canShowPrompter(prop: string, shown: Set<string> = new Set(assigned)): boolean {
        const defaultState = form.applyDefaults(state)

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
        const actual = _.get(form.applyDefaults(state), path)

        return (expected: TProp) =>
            failIf(actual !== expected, `Property "${path}" had unexpected value: ${actual} !== ${expected}`)
    }

    function assertShowCount(): MockWizardFormElement<T>['assertShowCount'] {
        return (expected: number) => {
            const total = assigned.length
            assert.strictEqual(total, expected, 'Expected number of prompts were not shown.')
        }
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

    const createElement: (prop: string) => MockWizardFormElement<any> = prop => ({
        applyInput: <TProp>(input: TProp) => (_.set(state, prop, input), evaluate()),
        clearInput: () => (_.set(state, prop, undefined), evaluate()),
        assertShow: assertShow(prop),
        assertShowFirst: assertShow(prop, 1),
        assertShowSecond: assertShow(prop, 2),
        assertShowThird: assertShow(prop, 3),
        assertShowAny: () => failIf(showableChildren(prop).length === 0, `No properties of "${prop}" would be shown`),
        assertDoesNotShow: () => failIf(hasProp(prop), `Property "${prop}" would be shown`),
        assertDoesNotShowAny: assertShowNone(prop),
        assertValue: assertValue(prop),
        assertShowCount: assertShowCount(),
    })

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
