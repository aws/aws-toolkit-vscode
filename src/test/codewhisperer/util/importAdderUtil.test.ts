/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    findLineToInsertImportStatement,
    findLineOfFirstCode,
    findLineOfLastImportStatement,
} from '../../../codewhisperer/util/importAdderUtil'
import { createMockTextEditor } from '../testUtil'

describe('importAdderUtil', function () {
    describe('findLineToInsertImportStatement', async function () {
        it('Should return last line of import statement before recommendation if there is any import statement', function () {
            const mockEditor = createMockTextEditor(
                `
            import numpy as np
            from a import b
            a = 10
            b = 20
            import lambda as x
            `,
                'test.py',
                'python'
            )
            const actual = findLineToInsertImportStatement(mockEditor, 3)
            assert.strictEqual(actual, 3)
        })
        it('Should return first line of code if there is no import statement before recommendation', function () {
            const mockEditor = createMockTextEditor(
                `
            a = 10
            b = 100
            from c import b as z
            `,
                'test.py',
                'python'
            )
            const actual = findLineToInsertImportStatement(mockEditor, 1)
            assert.strictEqual(actual, 1)
        })

        it('Should skip license in java', function () {
            const mockEditor = createMockTextEditor(
                `/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0 
 */

                package aws.com;
                public void main() {

                }
                `,
                'test.java',
                'java'
            )
            const actual = findLineToInsertImportStatement(mockEditor, 7)
            assert.strictEqual(actual, 6)
        })
    })

    describe('findLineOfFirstCode', async function () {
        it('Should return 0 if file is empty', function () {
            const mockEditor = createMockTextEditor(
                `
            
            `,
                'test.py',
                'python'
            )
            const actual = findLineOfFirstCode(mockEditor, 0)
            assert.strictEqual(actual, 0)
        })
        it('Should return first line after comments and use strict in JS ', function () {
            const mockEditor = createMockTextEditor(
                `
            // This is a auto generated document
            //  
            // 
            //
            'use strict';
            console.log('Hellow')
            `,
                'test.js',
                'javascript'
            )
            const actual = findLineOfFirstCode(mockEditor, 6)
            assert.strictEqual(actual, 6)
        })
        it('Should return one line after package statement in java ', function () {
            const mockEditor = createMockTextEditor(
                `
            // This is a auto generated document
            package com.aws.example;
            public class Main {
                public void static main(String[] args){

                }
            }
            `,
                'test.java',
                'java'
            )
            const actual = findLineOfFirstCode(mockEditor, 4)
            assert.strictEqual(actual, 3)
        })

        it('Should skip docstring in javascript', function () {
            const mockEditor = createMockTextEditor(
                `/*!
 * DOC STRING
 */
                console.log('hello');
                const a = 10;
                `,
                'test.js',
                'javascript'
            )
            const actual = findLineOfFirstCode(mockEditor, 5)
            assert.strictEqual(actual, 3)
        })
    })

    describe('findLineOfLastImportStatement', async function () {
        it('Should return -1 if there is no import statement in python', function () {
            const mockEditor = createMockTextEditor(`a = 10\nprint('Hello, world!')`, 'python')
            const actual = findLineOfLastImportStatement(mockEditor, 0)
            assert.strictEqual(actual, -1)
        })
        it('Should return -1 if there is no import statement in java', function () {
            const mockEditor = createMockTextEditor(
                `public class Main {
                int x = 5;
                public static void main() {

                }
              }
              `,
                'test.java',
                'java'
            )
            const actual = findLineOfLastImportStatement(mockEditor, 0)
            assert.strictEqual(actual, -1)
        })
        it('Should return -1 if there is no import statement in js', function () {
            const mockEditor = createMockTextEditor(`console.log('Hello World');`, 'test.js', 'javascript')
            const actual = findLineOfLastImportStatement(mockEditor, 0)
            assert.strictEqual(actual, -1)
        })

        it('Should return 4 if there is import at line 3', function () {
            const mockEditor = createMockTextEditor(
                `
            import pandas
            import numpy as np
            from numpy import *
            print('Hello, world!')`,
                'test.py',
                'python'
            )
            const actual = findLineOfLastImportStatement(mockEditor, 4)
            assert.strictEqual(actual, 4)
        })
    })
})
