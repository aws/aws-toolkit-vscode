/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { applyUnifiedDiff, getAddedAndDeletedCharCount } from '../../../../../src/app/inline/EditRendering/diffUtils'

describe('diffUtils', function () {
    describe('applyUnifiedDiff', function () {
        it('should correctly apply a unified diff to original text', function () {
            // Original code
            const originalCode = 'function add(a, b) {\n  return a + b;\n}'

            // Unified diff that adds a comment and modifies the return statement
            const unifiedDiff =
                '--- a/file.js\n' +
                '+++ b/file.js\n' +
                '@@ -1,3 +1,4 @@\n' +
                ' function add(a, b) {\n' +
                '+  // Add two numbers\n' +
                '-  return a + b;\n' +
                '+  return a + b; // Return the sum\n' +
                ' }'

            // Expected result after applying the diff
            const expectedResult = 'function add(a, b) {\n  // Add two numbers\n  return a + b; // Return the sum\n}'

            // Apply the diff
            const { newCode } = applyUnifiedDiff(originalCode, unifiedDiff)

            // Verify the result
            assert.strictEqual(newCode, expectedResult)
        })
    })

    describe('getAddedAndDeletedCharCount', function () {
        it('should correctly calculate added and deleted character counts', function () {
            // Unified diff with additions and deletions
            const unifiedDiff =
                '--- a/file.js\n' +
                '+++ b/file.js\n' +
                '@@ -1,3 +1,4 @@\n' +
                ' function add(a, b) {\n' +
                '+  // Add two numbers\n' +
                '-  return a + b;\n' +
                '+  return a + b; // Return the sum\n' +
                ' }'

            // Calculate character counts
            const { addedCharacterCount, deletedCharacterCount } = getAddedAndDeletedCharCount(unifiedDiff)

            // Verify the counts with the actual values from the implementation
            assert.strictEqual(addedCharacterCount, 20)
            assert.strictEqual(deletedCharacterCount, 15)
        })
    })

    describe('applyUnifiedDiff with complex changes', function () {
        it('should handle multiple hunks in a diff', function () {
            // Original code with multiple functions
            const originalCode =
                'function add(a, b) {\n' +
                '  return a + b;\n' +
                '}\n' +
                '\n' +
                'function subtract(a, b) {\n' +
                '  return a - b;\n' +
                '}'

            // Unified diff that modifies both functions
            const unifiedDiff =
                '--- a/file.js\n' +
                '+++ b/file.js\n' +
                '@@ -1,3 +1,4 @@\n' +
                ' function add(a, b) {\n' +
                '+  // Addition function\n' +
                '   return a + b;\n' +
                ' }\n' +
                '@@ -5,3 +6,4 @@\n' +
                ' function subtract(a, b) {\n' +
                '+  // Subtraction function\n' +
                '   return a - b;\n' +
                ' }'

            // Expected result after applying the diff
            const expectedResult =
                'function add(a, b) {\n' +
                '  // Addition function\n' +
                '  return a + b;\n' +
                '}\n' +
                '\n' +
                'function subtract(a, b) {\n' +
                '  // Subtraction function\n' +
                '  return a - b;\n' +
                '}'

            // Apply the diff
            const { newCode } = applyUnifiedDiff(originalCode, unifiedDiff)

            // Verify the result
            assert.strictEqual(newCode, expectedResult)
        })
    })
})
