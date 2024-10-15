/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { extractCodeBlockLanguage } from '../../shared/markdown'

describe('extractCodeBlockLanguage', () => {
    it('should return "plaintext" when no code block is present', () => {
        const message = 'This is a message without a code block'
        assert.strictEqual(extractCodeBlockLanguage(message), 'plaintext')
    })

    it('should return the language when a code block with language is present', () => {
        const message = 'Here is some code:\n```javascript\nconsole.log("Hello");\n```'
        assert.strictEqual(extractCodeBlockLanguage(message), 'javascript')
    })

    it('should return "plaintext" when a code block is present but no language is specified', () => {
        const message = 'Here is some code:\n```\nconsole.log("Hello");\n```'
        assert.strictEqual(extractCodeBlockLanguage(message), 'plaintext')
    })

    it('should handle whitespace before the language specification', () => {
        const message = 'Code:\n```   typescript\nconst x: number = 5;\n```'
        assert.strictEqual(extractCodeBlockLanguage(message), 'typescript')
    })

    it('should handle empty messages', () => {
        assert.strictEqual(extractCodeBlockLanguage(''), 'plaintext')
    })
})
