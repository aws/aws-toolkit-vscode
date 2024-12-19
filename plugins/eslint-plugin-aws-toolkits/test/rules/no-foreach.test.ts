/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsg } from '../../lib/rules/no-foreach'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-foreach', rules['no-foreach'], {
    valid: ['list.map(f)', 'list.find(f)', 'list.forAll(f)', 'o.forEachItem(f)', ''],

    invalid: [
        { code: 'list.forEach((a) => await Promise.resolve(a * a))', errors: [errMsg] },
        { code: 'list.forEach(async (a: any) => console.log(x))', errors: [errMsg] },
        { code: 'list.forEach((a) => a.forEach(async (b) => a * b))', errors: [errMsg] },
        { code: 'list.forEach(async function () {})', errors: [errMsg] },
        { code: 'function f(){} \n list.forEach(f)', errors: [errMsg] },
        { code: 'const f = async () => {} \n list.forEach(f)', errors: [errMsg] },
        { code: 'const f = async function () {} \n list.forEach(f)', errors: [errMsg] },
        { code: 'class c { \n public async f() {} \n } \n [].forEach((new c().f))', errors: [errMsg] },
        {
            code: 'class c { \n public async f() {} \n } \n const c2 = new c() \n list.forEach(c2.f)',
            errors: [errMsg],
        },
        { code: 'function f() { \n return async function () {}} \n [].forEach(f())', errors: [errMsg] },
        {
            code: 'function f() { \n return new (class c { \n public async f2() {} \n })().f2 \n } \n list.forEach(f())',
            errors: [errMsg],
        },
        {
            code: 'function f() { \n return function f2() { \n return function f3() { \n return function f4() { \n return function f5() { \n return async function f6() { \n \n } \n } \n } \n } \n } \n } \n list.forEach(f()()()()())',
            errors: [errMsg],
        },
    ],
})
