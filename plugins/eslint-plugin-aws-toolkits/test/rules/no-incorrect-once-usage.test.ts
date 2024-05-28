/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { notAssignedErr, notReusableErr, oneOffErr } from '../../lib/rules/no-incorrect-once-usage'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-incorrect-once-usage', rules['no-incorrect-once-usage'], {
    valid: [
        'class A { private readonly logOnce = once(() => {}) }', // class property
        'const logOnce = once(() => {})', // top-level declaration
        'export const logOnce = once(() => {})', // top-level declaration
        'function test() { const logOnce = once(() => {}); while (true) { if (myVal) { logOnce() } } }', // used in a lower while loop scope
        'function test() { const logOnce = once(() => {}); for (let i = 0; i < 10; i++) { if (myVal) { logOnce() } } }', // used in a lower for loop scope
        'function test() { const logOnce = once(() => {}); for (let t in types) { if (myVal) { logOnce() } } }', // used in a lower for in loop scope
        'function test() { const logOnce = once(() => {}); for (let t of types) { if (myVal) { logOnce() } } }', // used in a lower for of loop scope
        'function test() { logOnce = once(() => {}) }', // assigned a higher-level variable (NOT FOOLPROOF)
        'class A { test() { this.logOnce = once(() => {}) } }', // assigned a property
        'function test() { const logOnce = once(() => {}); logOnce(); logOnce();}', // used multiple times, even if the usage is questionable.
    ],

    invalid: [
        {
            code: 'once(() => {})()',
            errors: [oneOffErr],
        },
        {
            code: 'function test() { once(() => {})() }',
            errors: [oneOffErr],
        },
        {
            code: 'const logOnce = once(() => {})()',
            errors: [oneOffErr],
        },
        {
            code: 'once(() => {})',
            errors: [notAssignedErr],
        },
        {
            code: 'function test() { const logOnce = once(() => {}); logOnce() }',
            errors: [notReusableErr],
        },
        {
            code: 'function test() { const logOnce = once(() => {}); if (myCond) { logOnce() } }',
            errors: [notReusableErr],
        },
    ],
})
