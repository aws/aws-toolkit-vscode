/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import assert from 'assert'
import { ExpandWithObject } from '../../../shared/utilities/tsUtils'
import { Wizard } from '../../../shared/wizards/wizard'
import { WizardForm } from '../../../shared/wizards/wizardForm'

interface MockWizardFormElement<TProp> {
    readonly value: TProp | undefined

    applyInput(input: TProp): void
    clearInput(): void
    /**
     * Verifies the property could be shown.
     *
     * Passing in the order argument specifies the relative order (1-indexed) in which prompters
     * would be shown. Properties that lack a prompter (e.g. forms) have no relative ordering.
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

type FormTesterMethodKey = keyof MockWizardFormElement<any>
const VALUE: FormTesterMethodKey = 'value' // eslint-disable-line @typescript-eslint/naming-convention
const APPLY_INPUT: FormTesterMethodKey = 'applyInput' // eslint-disable-line @typescript-eslint/naming-convention
const CLEAR_INPUT: FormTesterMethodKey = 'clearInput' // eslint-disable-line @typescript-eslint/naming-convention
const ASSERT_SHOW: FormTesterMethodKey = 'assertShow' // eslint-disable-line @typescript-eslint/naming-convention
const ASSERT_SHOW_FIRST: FormTesterMethodKey = 'assertShowFirst' // eslint-disable-line @typescript-eslint/naming-convention
const ASSERT_SHOW_SECOND: FormTesterMethodKey = 'assertShowSecond' // eslint-disable-line @typescript-eslint/naming-convention
const ASSERT_SHOW_THIRD: FormTesterMethodKey = 'assertShowThird' // eslint-disable-line @typescript-eslint/naming-convention
const ASSERT_SHOW_ANY: FormTesterMethodKey = 'assertShowAny' // eslint-disable-line @typescript-eslint/naming-convention
const NOT_ASSERT_SHOW: FormTesterMethodKey = 'assertDoesNotShow' // eslint-disable-line @typescript-eslint/naming-convention
const NOT_ASSERT_SHOW_ANY: FormTesterMethodKey = 'assertDoesNotShowAny' // eslint-disable-line @typescript-eslint/naming-convention
const ASSERT_VALUE: FormTesterMethodKey = 'assertValue' // eslint-disable-line @typescript-eslint/naming-convention
const SHOW_COUNT: FormTesterMethodKey = 'assertShowCount' // eslint-disable-line @typescript-eslint/naming-convention

type Tester<T> = MockForm<Required<T>> & Pick<MockWizardFormElement<any>, typeof SHOW_COUNT>
export type WizardTester<T> = T extends Wizard<infer U> ? Tester<U> : Tester<T>

function failIf(cond: boolean, message?: string): void {
    if (cond) {
        assert.fail(message)
    }
}

/** Wraps the `WizardForm` of a `Wizard` so you can assert its state. */
export async function createWizardTester<T extends Partial<T>>(wizard: Wizard<T> | WizardForm<T>): Promise<Tester<T>> {
    if (wizard instanceof Wizard && wizard.init) {
        // Ensure that init() was called. Needed because createWizardTester() does not call run().
        await wizard.init()
        delete wizard.init
    }

    const form = wizard instanceof Wizard ? wizard.boundForm : wizard
    const state = (wizard instanceof Wizard ? JSON.parse(JSON.stringify(wizard.initialState ?? {})) : {}) as T

    function canShowPrompter(prop: string): boolean {
        const defaultState = form.applyDefaults(state)

        if (!form.canShowProperty(prop, state, defaultState)) {
            return false
        }

        const provider = form.getPrompterProvider(prop)

        return provider !== undefined // && provider({ stepCache: {} } as any) !== undefined
    }

    function showableChildren(parent: string): string[] {
        return form.properties.filter(prop => prop !== parent && prop.startsWith(parent) && canShowPrompter(prop))
    }

    function getRelativeOrder(prop: string): number {
        return form.properties.filter(prop => canShowPrompter(prop)).indexOf(prop)
    }

    function assertOrder(prop: string, expected: number): void {
        const order = getRelativeOrder(prop)

        failIf(order === -1, `Property "${prop}" would not be shown`)
        failIf(
            order !== expected - 1,
            `Property "${prop}" would be shown in the wrong order: ${order + 1} !== ${expected}`
        )
    }

    function assertShow(prop: string, expected?: number): MockWizardFormElement<T>['assertShow'] {
        return (order: number | undefined = expected) =>
            order === undefined
                ? failIf(!form.canShowProperty(prop, state), `Property "${prop}" would not be shown`)
                : assertOrder(prop, order)
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

    function createFormWrapper(path: string[] = []): Tester<T> {
        return new Proxy(
            {},
            {
                get: (obj, prop, rec) => {
                    const propPath = path.join('.')

                    // Using a switch rather than a map since a generic index signature is not yet possible
                    switch (prop) {
                        case VALUE:
                            return _.get(form.applyDefaults(state), path)
                        case APPLY_INPUT:
                            return <TProp>(input: TProp) => _.set(state, path, input)
                        case CLEAR_INPUT:
                            return () => _.set(state, path, undefined)
                        case ASSERT_SHOW:
                            return assertShow(propPath)
                        case ASSERT_SHOW_FIRST:
                            return assertShow(propPath, 1)
                        case ASSERT_SHOW_SECOND:
                            return assertShow(propPath, 2)
                        case ASSERT_SHOW_THIRD:
                            return assertShow(propPath, 3)
                        case ASSERT_SHOW_ANY:
                            return () =>
                                failIf(
                                    showableChildren(propPath).length === 0,
                                    `No properties of "${propPath}" would be shown`
                                )
                        case NOT_ASSERT_SHOW:
                            return () =>
                                failIf(form.canShowProperty(propPath, state), `Property "${propPath}" would be shown`)
                        case NOT_ASSERT_SHOW_ANY:
                            return assertShowNone(propPath)
                        case ASSERT_VALUE:
                            return assertValue(propPath)
                        case SHOW_COUNT:
                            return (count: number) =>
                                assert.strictEqual(form.properties.filter(prop => canShowPrompter(prop)).length, count)
                        default:
                            return Reflect.get(obj, prop, rec) ?? createFormWrapper([...path, prop.toString()])
                    }
                },
            }
        ) as Tester<T>
    }

    return createFormWrapper()
}
