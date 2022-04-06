/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as consolasClient from '../../../../vector/consolas/client/consolas'
import { runtimeLanguageContext } from '../../../../vector/consolas/util/runtimeLanguageContext'
import * as EditorContext from '../../../../vector/consolas/util/editorContext'
import { createMockTextEditor, createMockClientRequest, resetConsolasGlobalVariables } from '../testUtil'

describe('editorContext', function () {
    beforeEach(function () {
        resetConsolasGlobalVariables()
    })
    describe('extractContextForConsolas', function () {
        it('Should return expected context', function () {
            const editor = createMockTextEditor('import math\ndef two_sum(nums, target):\n', 'test.py', 'python', 1, 17)
            const actual = EditorContext.extractContextForConsolas(editor)
            const expected: consolasClient.ConsolasFileContext = {
                leftFileContent: 'import math\ndef two_sum(nums,',
                rightFileContent: ' target):\n',
            }
            assert.deepStrictEqual(actual, expected)
        })

        it('Should return expected context within max char limit', function () {
            const editor = createMockTextEditor(
                'import math\ndef ' + 'a'.repeat(6000) + 'two_sum(nums, target):\n',
                'test.py',
                'python',
                1,
                17
            )
            const actual = EditorContext.extractContextForConsolas(editor)
            const expected: consolasClient.ConsolasFileContext = {
                leftFileContent: 'import math\ndef aaaaaaaaaaaaa',
                rightFileContent: 'a'.repeat(5120),
            }
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

    describe('getProgrammingLanguage', function () {
        it('Should return expected programming language and set invocationContext.language', function () {
            const editor = createMockTextEditor('', 'test.py', 'python', 1, 17)
            runtimeLanguageContext.setRuntimeLanguageContext('python', 'python2', '2.7')
            const actual = EditorContext.getProgrammingLanguage(editor)
            const expected: consolasClient.ConsolasProgLang = {
                languageName: 'python',
                runtimeVersion: '2.7',
            }
            assert.deepStrictEqual(actual, expected)
        })

        it('Should return expected programming language and set invocationContext.language when editor is undefined', function () {
            runtimeLanguageContext.setRuntimeLanguageContext('python', 'python2', '2.7')
            const actual = EditorContext.getProgrammingLanguage(undefined)
            const expected: consolasClient.ConsolasProgLang = {
                languageName: '',
                runtimeVersion: '',
            }
            assert.deepStrictEqual(actual, expected)
        })
    })

    describe('validateRequest', function () {
        it('Should return false if request filename.length is invalid', function () {
            const req = createMockClientRequest()
            req.contextInfo.filename = ''
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return false if request programming language is invalid', function () {
            const req = createMockClientRequest()
            req.contextInfo.programmingLanguage.languageName = ''
            assert.ok(!EditorContext.validateRequest(req))
            req.contextInfo.programmingLanguage.languageName = 'a'.repeat(200)
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return false if request runtime version is invalid', function () {
            const req = createMockClientRequest()
            req.contextInfo.programmingLanguage.runtimeVersion = ''
            assert.ok(!EditorContext.validateRequest(req))
            req.contextInfo.programmingLanguage.runtimeVersion = 'a'.repeat(200)
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return false if request natural langauge code is invalid', function () {
            const req = createMockClientRequest()
            req.contextInfo.naturalLanguageCode = 'e'
            assert.ok(!EditorContext.validateRequest(req))
            req.contextInfo.naturalLanguageCode = 'en_us_en'
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return false if request left or right context exceeds max length', function () {
            const req = createMockClientRequest()
            req.fileContext.leftFileContent = 'a'.repeat(6000)
            assert.ok(!EditorContext.validateRequest(req))
            req.fileContext.leftFileContent = 'a'
            req.fileContext.rightFileContent = 'a'.repeat(6000)
            assert.ok(!EditorContext.validateRequest(req))
        })

        it('Should return false if req maxRecommendations is out of range', function () {
            assert.ok(!EditorContext.validateRequest(createMockClientRequest(0)))
            assert.ok(!EditorContext.validateRequest(createMockClientRequest(11)))
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
