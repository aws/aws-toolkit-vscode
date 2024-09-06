/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { describeOnlyErrMsg, itOnlyErrMsg } from '../../lib/rules/no-only-in-tests'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-only-in-tests', rules['no-only-in-tests'], {
    valid: [
        "describe('my suite', function () {})",
        "describe('my suite', function () { it('does things', () => {})})",
        "it('does things', async function () {})",
    ],

    invalid: [
        {
            code: "describe.only('mySuite', function () { it('does things', async function () {} ) })",
            errors: [describeOnlyErrMsg],
            output: "describe('mySuite', function () { it('does things', async function () {} ) })",
        },
        {
            code: "describe('mySuite', function() { it.only('does things', async function () { console.log('did things') })})",
            errors: [itOnlyErrMsg],
            output: "describe('mySuite', function() { it('does things', async function () { console.log('did things') })})",
        },
        {
            code: "describe.only('mySuite', function() { it.only('does things', async function () { console.log('did things') })})",
            errors: [describeOnlyErrMsg, itOnlyErrMsg],
            output: "describe('mySuite', function() { it('does things', async function () { console.log('did things') })})",
        },
        {
            code: "it.only('does things', async function () { console.log('did things') })",
            errors: [itOnlyErrMsg],
            output: "it('does things', async function () { console.log('did things') })",
        },
    ],
})
