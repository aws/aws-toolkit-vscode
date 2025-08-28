/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { stripCommonIndentation } from '../../../../../../src/app/inline/EditRendering/stringUtils'

describe('stripCommonIndentation', () => {
    it('should strip common leading whitespace', () => {
        const input = ['    line1 ', '    line2 ', '        line3   ']
        const expected = ['line1 ', 'line2 ', '    line3   ']
        assert.deepStrictEqual(stripCommonIndentation(input), expected)
    })

    it('should handle HTML tags', () => {
        const input = [
            '<span class="diff-unchanged>       line1 </span>',
            '<span class="diff-changed>   line2  </span>',
        ]
        const expected = ['<span class="diff-unchanged>    line1 </span>', '<span class="diff-changed>line2  </span>']
        assert.deepStrictEqual(stripCommonIndentation(input), expected)
    })

    it('should handle mixed indentation', () => {
        const input = [' line1', '    line2', '  line3']
        const expected = ['line1', '   line2', ' line3']
        assert.deepStrictEqual(stripCommonIndentation(input), expected)
    })

    it('should handle empty lines', () => {
        const input = ['    line1', '', '    line2']
        const expected = ['    line1', '', '    line2']
        assert.deepStrictEqual(stripCommonIndentation(input), expected)
    })

    it('should handle no indentation', () => {
        const input = ['line1', 'line2']
        const expected = ['line1', 'line2']
        assert.deepStrictEqual(stripCommonIndentation(input), expected)
    })

    it('should handle single line', () => {
        const input = ['    single line']
        const expected = ['single line']
        assert.deepStrictEqual(stripCommonIndentation(input), expected)
    })
})
