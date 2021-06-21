/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as assert from 'assert'
import { WizardForm } from '../../../shared/wizards/wizardForm'

// testing philosophy: 
// apply input, assert certain fields will (or won't) be shown
// we should not need to test a full flow, we only need to test
// the control logic itself, including default values

interface MockWizardFormElement<TProp> {
    applyInput(input: TProp): void
    removeInput(): void
    assertShow(order?: number, message?: string): void
    assertDoesNotShow(message?: string): void
    assertDoesNotShowAny(message?: string): void
    assertValue(expected: TProp | undefined, message?: string): void
}

type Expand<T> = T extends infer O ? { [K in keyof O]+?: O[K] } : never
type ExpandWithObject<T> = Expand<T> extends Record<string, unknown> ? Expand<T> : never
type MockForm<T, TState=T> = {
    [Property in keyof T]-?: T[Property] extends ExpandWithObject<T[Property]>
        ? (MockForm<Required<T[Property]>, TState> & MockWizardFormElement<T[Property]>)
        : MockWizardFormElement<T[Property]>
}

export type FormTester<T> = MockForm<Required<T>> & { showCount: number }

type FormTesterMethodKey = keyof MockWizardFormElement<any>
const APPLY_INPUT: FormTesterMethodKey = 'applyInput'
const REMOVE_INPUT: FormTesterMethodKey = 'removeInput'
const ASSERT_SHOW: FormTesterMethodKey = 'assertShow'
const NOT_ASSERT_SHOW: FormTesterMethodKey = 'assertDoesNotShow'
const NOT_ASSERT_SHOW_ANY: FormTesterMethodKey = 'assertDoesNotShowAny'
const ASSERT_VALUE: FormTesterMethodKey = 'assertValue'

export function createFormTester<T extends Partial<T>>(form: WizardForm<T>): FormTester<T> {
    const state = {} as T

    // TODO: make this a property of every parent element, then we assert for all children
    const base = Object.defineProperty({}, 'showCount', {
        get: () => form.properties.filter(prop => form.canShowProperty(prop, state)).length
    })

    // inclusive of the target property
    function doesShowChildren(parent: string, state: T): boolean {
        const defaultState = form.applyDefaults(state)
        return form.properties.some(prop => prop.startsWith(parent) && form.canShowProperty(prop, state, defaultState))
    }

    // TODO: make 'assertShowFirst', etc. or fix the order (1 instead of 0)
    function getRelativeOrder(prop: string, state: T): number {
        const defaultState = form.applyDefaults(state)
        return form.properties.filter(prop => form.canShowProperty(prop, state, defaultState)).indexOf(prop)
    }

    // TODO: fix up these to display default messages instead of the useless assert message
    // also refactor this into something better
    function createMockForm(state: T, path: string[] = []): FormTester<T> { 
        return new Proxy(path.length === 0 ? base : {}, {
            get: (obj, prop, rec) => {
                const propPath = path.join('.')
                
                switch (prop) {
                    case APPLY_INPUT:
                        return <TProp>(input: TProp) =>  _.set(state, path, input)
                    case REMOVE_INPUT:
                        return () => _.set(state, path, undefined)
                    case ASSERT_SHOW:
                        return (order?: number, message?: string) => order === undefined 
                            ? assert.ok(form.canShowProperty(propPath, state), message)
                            : assert.strictEqual(getRelativeOrder(propPath, state), order, message)
                    case NOT_ASSERT_SHOW: 
                        return (message?: string) => assert.ok(!form.canShowProperty(propPath, state), message)
                    case NOT_ASSERT_SHOW_ANY:
                        return (message?: string) => assert.ok(!doesShowChildren(propPath, state), message)
                    case ASSERT_VALUE: 
                        return <TProp>(expected: TProp, message?: string) => 
                            assert.deepStrictEqual(_.get(form.applyDefaults(state), path), expected, message)
                    default:
                        return Reflect.get(obj, prop, rec) ?? createMockForm(state, [...path, prop.toString()])
                }
            }
        }) as FormTester<T>
    }

    return createMockForm(state)
}