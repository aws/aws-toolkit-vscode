/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as assert from 'assert'
import { WizardForm } from '../../../shared/wizards/wizardForm'
import { ExpandWithObject } from '../../../shared/utilities/tsUtils'

interface MockWizardFormElement<TProp> {
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
    assertDoesNotShow(): void
    /** Verifies that no sub-properties of the target would show prompters. */
    assertDoesNotShowAny(): void
    assertValue(expected: TProp | undefined): void
}

type MockForm<T, TState = T> = {
    [Property in keyof T]-?: T[Property] extends ExpandWithObject<T[Property]>
        ? MockForm<Required<T[Property]>, TState> & MockWizardFormElement<T[Property]>
        : MockWizardFormElement<T[Property]>
}

export type FormTester<T> = MockForm<Required<T>> & { showCount: number }

type FormTesterMethodKey = keyof MockWizardFormElement<any>
const APPLY_INPUT: FormTesterMethodKey = 'applyInput'
const CLEAR_INPUT: FormTesterMethodKey = 'clearInput'
const ASSERT_SHOW: FormTesterMethodKey = 'assertShow'
const ASSERT_SHOW_FIRST: FormTesterMethodKey = 'assertShowFirst'
const ASSERT_SHOW_SECOND: FormTesterMethodKey = 'assertShowSecond'
const ASSERT_SHOW_THIRD: FormTesterMethodKey = 'assertShowThird'
const NOT_ASSERT_SHOW: FormTesterMethodKey = 'assertDoesNotShow'
const NOT_ASSERT_SHOW_ANY: FormTesterMethodKey = 'assertDoesNotShowAny'
const ASSERT_VALUE: FormTesterMethodKey = 'assertValue'

function failIf(cond: boolean, message?: string): void {
    if (cond) {
        assert.fail(message)
    }
}

export function createFormTester<T extends Partial<T>>(form: WizardForm<T>): FormTester<T> {
    const state = {} as T

    const base = Object.defineProperty({}, 'showCount', {
        get: () => form.properties.filter(prop => canShowPrompter(prop)).length,
    })

    function canShowPrompter(prop: string): boolean {
        const defaultState = form.applyDefaults(state)

        if (!form.canShowProperty(prop, state, defaultState)) {
            return false
        }

        const provider = form.getPrompterProvider(prop)

        return provider !== undefined && provider({} as any) !== undefined
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
            order !== expected + 1,
            `Property "${prop}" would be shown in the wrong order: ${order} !== ${expected + 1}`
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

    function createFormWrapper(path: string[] = []): FormTester<T> {
        return new Proxy(path.length === 0 ? base : {}, {
            get: (obj, prop, rec) => {
                const propPath = path.join('.')

                // Using a switch rather than a map since a generic index signature is not yet possible
                switch (prop) {
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
                    case NOT_ASSERT_SHOW:
                        return () => failIf(form.canShowProperty(propPath, state), `Property "${prop}" would be shown`)
                    case NOT_ASSERT_SHOW_ANY:
                        return assertShowNone(propPath)
                    case ASSERT_VALUE: // TODO: remove message
                        return <TProp>(expected: TProp) =>
                            assert.deepStrictEqual(
                                _.get(form.applyDefaults(state), path),
                                expected,
                                `Property "${prop}" had unexpected value`
                            )
                    default:
                        return Reflect.get(obj, prop, rec) ?? createFormWrapper([...path, prop.toString()])
                }
            },
        }) as FormTester<T>
    }

    return createFormWrapper()
}
