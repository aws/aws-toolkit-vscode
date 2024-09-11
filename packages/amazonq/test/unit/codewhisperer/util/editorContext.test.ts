/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as codewhispererClient from 'aws-core-vscode/codewhisperer'
import * as EditorContext from 'aws-core-vscode/codewhisperer'
import {
    createMockTextEditor,
    createMockClientRequest,
    resetCodeWhispererGlobalVariables,
    openATextEditorWithText,
    createTestWorkspaceFolder,
    closeAllEditors,
} from 'aws-core-vscode/test'
import { globals } from 'aws-core-vscode/shared'
import { GenerateCompletionsRequest } from 'aws-core-vscode/codewhisperer'

describe('editorContext', function () {
    let telemetryEnabledDefault: boolean
    let tempFolder: string

    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
        telemetryEnabledDefault = globals.telemetry.telemetryEnabled
    })

    afterEach(async function () {
        await globals.telemetry.setTelemetryEnabled(telemetryEnabledDefault)
    })

    describe('extractContextForCodeWhisperer', function () {
        it('Should return expected context', function () {
            const editor = createMockTextEditor('import math\ndef two_sum(nums, target):\n', 'test.py', 'python', 1, 17)
            const actual = EditorContext.extractContextForCodeWhisperer(editor)
            const expected: codewhispererClient.FileContext = {
                filename: 'test.py',
                programmingLanguage: {
                    languageName: 'python',
                },
                leftFileContent: 'import math\ndef two_sum(nums,',
                rightFileContent: ' target):\n',
            }
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
            const expected: codewhispererClient.FileContext = {
                filename: 'test.py',
                programmingLanguage: {
                    languageName: 'python',
                },
                leftFileContent: 'import math\ndef aaaaaaaaaaaaa',
                rightFileContent: 'a'.repeat(10240),
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

        it('Should return expected filename for a long filename', async function () {
            const editor = createMockTextEditor('', 'a'.repeat(1500), 'python', 1, 17)
            const actual = EditorContext.getFileName(editor)
            const expected = 'a'.repeat(1024)
            assert.strictEqual(actual, expected)
        })
    })

    describe('getFileRelativePath', function () {
        this.beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

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
                const actual = EditorContext.getFileRelativePath(editor)
                const expected = 'test.' + extension
                assert.strictEqual(actual, expected)
            })
        })

        it('Should return relative path', async function () {
            const editor = await openATextEditorWithText('tttt', 'test.py', tempFolder)
            const actual = EditorContext.getFileRelativePath(editor)
            const expected = 'test.py'
            assert.strictEqual(actual, expected)
        })

        afterEach(async function () {
            await closeAllEditors()
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

    describe('buildListRecommendationRequest', function () {
        it('Should return expected fields for optOut, nextToken and reference config', async function () {
            const nextToken = 'testToken'
            const optOutPreference = false
            await globals.telemetry.setTelemetryEnabled(false)
            const editor = createMockTextEditor('import math\ndef two_sum(nums, target):\n', 'test.py', 'python', 1, 17)
            const actual = await EditorContext.buildListRecommendationRequest(editor, nextToken, optOutPreference)

            assert.strictEqual(actual.request.nextToken, nextToken)
            assert.strictEqual((actual.request as GenerateCompletionsRequest).optOutPreference, 'OPTOUT')
            assert.strictEqual(actual.request.referenceTrackerConfiguration?.recommendationsWithReferences, 'BLOCK')
        })
    })
})
