/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsg } from '../../lib/rules/no-inline-async-foreach'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-inline-async-foreach', rules['no-inline-async-foreach'], {
    valid: [
        'list.forEach((a) => a * a)',
        'list.forEach(asyncFunctionOrNot)',
        'list.forEach(() => console.log(x))',
        'list.forEach(function () {})',
    ],

    invalid: [
        { code: 'list.forEach(async (a) => await Promise.resolve(a * a))', errors: [errMsg] },
        { code: 'list.forEach(async (a: any) => console.log(x))', errors: [errMsg] },
        { code: 'list.forEach((a) => a.forEach(async (b) => a * b))', errors: [errMsg] },
        { code: 'list.forEach(async function () {})', errors: [errMsg] },
    ],
})
