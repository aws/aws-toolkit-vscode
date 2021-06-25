/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RuleTester } from 'eslint'
import { rules } from '../../'

const ruleTester = new RuleTester({
    parserOptions: { ecmaVersion: 2017 },
})
const expectedErrorMessage = 'No arrow functions allowed!'
const errors = [{ message: expectedErrorMessage, column: 1, line: 1 }]

ruleTester.run('no-mocha-arrows', rules['no-mocha-arrows'], {
    valid: [
        'it()',
        'it(function() { assert(something, false); })',
        'it("should be false", function() { assert(something, false); })',
        'it.only()',
        'it(function(done) { assert(something, false); done(); })',
        'it(function*() { assert(something, false) })',
        'it(async function () { assert(something, false) })',

        // In those examples, `it` is not a global.
        'function it () {}; it(() => { console.log("okay") })',
        'function it () {}; it.only(() => { console.log("okay") })',
        'function it () {}; it(() => {}); it(() => {});',
    ],

    invalid: [
        {
            code: 'it(() => { assert(something, false); })',
            errors,
            output: 'it(function() { assert(something, false); })',
        },
        {
            code: 'it(() => { assert(something, false); })',
            errors,
            output: 'it(function() { assert(something, false); })',
        },
        {
            code: 'it(() => assert(something, false))',
            errors,
            output: 'it(function() { return assert(something, false); })',
        },
        {
            code: 'it(done => assert(something, false))',
            errors,
            output: 'it(function(done) { return assert(something, false); })',
        },
        {
            code: 'it("should be false", () => { assert(something, false); })',
            errors,
            output: 'it("should be false", function() { assert(something, false); })',
        },
        {
            code: 'it.only(() => { assert(something, false); })',
            errors: [{ message: 'Do not pass arrow functions to it.only()', column: 1, line: 1 }],
            output: 'it.only(function() { assert(something, false); })',
        },
        {
            code: 'it((done) => { assert(something, false); })',
            errors,
            output: 'it(function(done) { assert(something, false); })',
        },
        {
            code: 'it(done => { assert(something, false); })',
            errors,
            output: 'it(function(done) { assert(something, false); })',
        },
        {
            code: 'it("should be false", () => {\n assert(something, false);\n})',
            errors,
            output: 'it("should be false", function() {\n assert(something, false);\n})',
        },
        {
            code: 'it(async () => { assert(something, false) })',
            errors,
            output: 'it(async function() { assert(something, false) })',
        },
        {
            code: 'it(async () => assert(something, false))',
            errors,
            output: 'it(async function() { return assert(something, false); })',
        },
        {
            code: 'it(async done => assert(something, false))',
            errors,
            output: 'it(async function(done) { return assert(something, false); })',
        },
        {
            code: 'it(async (done) => assert(something, false))',
            errors,
            output: 'it(async function(done) { return assert(something, false); })',
        },
        {
            code: 'it(async() => assert(something, false))',
            errors,
            output: 'it(async function() { return assert(something, false); })',
        },
        {
            code: 'it(/*one*/async/*two*/(done)/*three*/=>/*four*/assert(something, false))',
            errors,
            output: 'it(/*one*/async function/*two*/(done)/*three*//*four*/ { return assert(something, false); })',
        },
    ],
})
