/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as EditorContext from '../../../codewhisperer/util/editorContext'
import { createMockTextEditor, createMockClientRequest, resetCodeWhispererGlobalVariables } from '../testUtil'
import { CWFileContext } from '../../../codewhisperer/models/model'
import CodeWhispererClient from '../../../codewhisperer/client/codewhispererclient'
import CodeWhispererUserClient from '../../../codewhisperer/client/codewhispereruserclient'

describe('editorContext', function () {
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })
    describe('extractContextForCodeWhisperer', function () {
        it('Should return expected context', function () {
            const editor = createMockTextEditor('import math\ndef two_sum(nums, target):\n', 'test.py', 'python', 1, 17)
            const actual = EditorContext.extractContextForCodeWhisperer(editor)
            const expected = new CWFileContext('test.py', 'python', 'import math\ndef two_sum(nums,', ' target):\n')
            assert.deepStrictEqual(actual, expected)
        })

        it('Should return expected context within max char limit', function () {
            const editor = createMockTextEditor(
                'import math\ndef ' + 'a'.repeat(10340) + 'two_sum(nums, target):\n',
                'test.py',
                'python',
                1,
                17
            )
            const actual = EditorContext.extractContextForCodeWhisperer(editor)
            const expected = new CWFileContext('test.py', 'python', 'import math\ndef aaaaaaaaaaaaa', 'a'.repeat(10240))
            assert.deepStrictEqual(actual, expected)
        })
    })

    describe('getFileName', function () {
        it('Should return expected filename given a document reading test.py', function () {
            const editor = createMockTextEditor('', 'test.py', 'python', 1, 17)
            const actual = EditorContext.getFileName(editor)
            const expected = 'test.py'
            assert.strictEqual(actual, expected)
        })

        it('Should return expected filename for a long filename', function () {
            const editor = createMockTextEditor('', 'a'.repeat(1500), 'python', 1, 17)
            const actual = EditorContext.getFileName(editor)
            const expected = 'a'.repeat(1024)
            assert.strictEqual(actual, expected)
        })
    })

    describe('getfileNameForRequest', function () {
        it('Should return a new filename with correct extension given a .ipynb file', function () {
            const languageToExtension = new Map<string, string>([
                ['python', 'py'],
                ['rust', 'rs'],
                ['javascript', 'js'],
                ['typescript', 'ts'],
                ['c', 'c'],
            ])

            languageToExtension.forEach((extension, language) => {
                const editor = createMockTextEditor('', 'test.ipynb', language, 1, 17)
                const actual = EditorContext.getFileNameForRequest(editor)
                const expected = 'test.' + extension
                assert.strictEqual(actual, expected)
            })
        })
    })

    describe('validateRequest', function () {
        it('Should return false if request filename.length is invalid', function () {
            const req = createMockClientRequest()
            req.fileContext.filename = ''
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return false if request programming language is invalid', function () {
            const req = createMockClientRequest()
            req.fileContext.programmingLanguage.languageName = ''
            assert.ok(!EditorContext.validateRequest(req))
            req.fileContext.programmingLanguage.languageName = 'a'.repeat(200)
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return false if request left or right context exceeds max length', function () {
            const req = createMockClientRequest()
            req.fileContext.leftFileContent = 'a'.repeat(256000)
            assert.ok(!EditorContext.validateRequest(req))
            req.fileContext.leftFileContent = 'a'
            req.fileContext.rightFileContent = 'a'.repeat(256000)
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return true if above conditions are not met', function () {
            const req = createMockClientRequest()
            assert.ok(EditorContext.validateRequest(req))
        })
    })

    describe('getLeftContext', function () {
        it('Should return expected left context', function () {
            const editor = createMockTextEditor('import math\ndef two_sum(nums, target):\n', 'test.py', 'python', 1, 17)
            const actual = EditorContext.getLeftContext(editor, 1)
            const expected = '...wo_sum(nums, target)'
            assert.strictEqual(actual, expected)
        })
    })
})
