/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as codewhispererClient from 'aws-core-vscode/codewhisperer'
import * as EditorContext from 'aws-core-vscode/codewhisperer'
import {
    createMockDocument,
    createMockTextEditor,
    createMockClientRequest,
    resetCodeWhispererGlobalVariables,
    toTextEditor,
    createTestWorkspaceFolder,
    closeAllEditors,
} from 'aws-core-vscode/test'
import { globals } from 'aws-core-vscode/shared'
import { GenerateCompletionsRequest } from 'aws-core-vscode/codewhisperer'
import * as vscode from 'vscode'

export function createNotebookCell(
    document: vscode.TextDocument = createMockDocument('def example():\n    return "test"'),
    kind: vscode.NotebookCellKind = vscode.NotebookCellKind.Code,
    notebook: vscode.NotebookDocument = {} as any,
    index: number = 0,
    outputs: vscode.NotebookCellOutput[] = [],
    metadata: { readonly [key: string]: any } = {},
    executionSummary?: vscode.NotebookCellExecutionSummary
): vscode.NotebookCell {
    return {
        document,
        kind,
        notebook,
        index,
        outputs,
        metadata,
        executionSummary,
    }
}

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

        it('Should include context from other cells when in a notebook', async function () {
            const cells: vscode.NotebookCellData[] = [
                new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, 'Previous cell', 'python'),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'import numpy as np\nimport pandas as pd\n\ndef analyze_data(df):\n    # Current cell with cursor here',
                    'python'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    '# Process the data\nresult = analyze_data(df)\nprint(result)',
                    'python'
                ),
            ]

            const document = await vscode.workspace.openNotebookDocument(
                'jupyter-notebook',
                new vscode.NotebookData(cells)
            )
            const editor: any = {
                document: document.cellAt(1).document,
                selection: { active: new vscode.Position(4, 13) },
            }

            const actual = EditorContext.extractContextForCodeWhisperer(editor)
            const expected: codewhispererClient.FileContext = {
                filename: 'Untitled-1.py',
                programmingLanguage: {
                    languageName: 'python',
                },
                leftFileContent:
                    '# Previous cell\nimport numpy as np\nimport pandas as pd\n\ndef analyze_data(df):\n    # Current',
                rightFileContent:
                    ' cell with cursor here\n# Process the data\nresult = analyze_data(df)\nprint(result)\n',
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

            for (const [language, extension] of languageToExtension.entries()) {
                const editor = createMockTextEditor('', 'test.ipynb', language, 1, 17)
                const actual = EditorContext.getFileRelativePath(editor)
                const expected = 'test.' + extension
                assert.strictEqual(actual, expected)
            }
        })

        it('Should return relative path', async function () {
            const editor = await toTextEditor('tttt', 'test.py', tempFolder)
            const actual = EditorContext.getFileRelativePath(editor)
            const expected = 'test.py'
            assert.strictEqual(actual, expected)
        })

        afterEach(async function () {
            await closeAllEditors()
        })
    })

    describe('extractSingleCellContext', function () {
        it('Should return cell text for python code cells when language is python', function () {
            const mockCodeCell = createNotebookCell(createMockDocument('def example():\n    return "test"'))
            const result = EditorContext.extractSingleCellContext(mockCodeCell, 'python')
            assert.strictEqual(result, 'def example():\n    return "test"')
        })

        it('Should return java comments for python code cells when language is java', function () {
            const mockCodeCell = createNotebookCell(createMockDocument('def example():\n    return "test"'))
            const result = EditorContext.extractSingleCellContext(mockCodeCell, 'java')
            assert.strictEqual(result, '// def example():\n//     return "test"')
        })

        it('Should return python comments for java code cells when language is python', function () {
            const mockCodeCell = createNotebookCell(createMockDocument('println(1 + 1);', 'somefile.ipynb', 'java'))
            const result = EditorContext.extractSingleCellContext(mockCodeCell, 'python')
            assert.strictEqual(result, '# println(1 + 1);')
        })

        it('Should add python comment prefixes for markdown cells when language is python', function () {
            const mockMarkdownCell = createNotebookCell(
                createMockDocument('# Heading\nThis is a markdown cell'),
                vscode.NotebookCellKind.Markup
            )
            const result = EditorContext.extractSingleCellContext(mockMarkdownCell, 'python')
            assert.strictEqual(result, '# # Heading\n# This is a markdown cell')
        })

        it('Should add java comment prefixes for markdown cells when language is java', function () {
            const mockMarkdownCell = createNotebookCell(
                createMockDocument('# Heading\nThis is a markdown cell'),
                vscode.NotebookCellKind.Markup
            )
            const result = EditorContext.extractSingleCellContext(mockMarkdownCell, 'java')
            assert.strictEqual(result, '// # Heading\n// This is a markdown cell')
        })
    })

    describe('extractPrefixCellsContext', function () {
        it('Should extract content from cells in reverse order up to maxLength', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('First cell content')),
                createNotebookCell(createMockDocument('Second cell content')),
                createNotebookCell(createMockDocument('Third cell content')),
            ]

            const result = EditorContext.extractPrefixCellsContext(mockCells, 100, 'python')
            assert.strictEqual(result, 'First cell content\nSecond cell content\nThird cell content\n')
        })

        it('Should respect maxLength parameter', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('First')),
                createNotebookCell(createMockDocument('Second')),
                createNotebookCell(createMockDocument('Third')),
                createNotebookCell(createMockDocument('Fourth')),
            ]

            const result = EditorContext.extractPrefixCellsContext(mockCells, 15, 'python')
            assert.strictEqual(result, 'd\nThird\nFourth\n')
        })

        it('Should handle empty cells array', function () {
            const result = EditorContext.extractPrefixCellsContext([], 100, '')
            assert.strictEqual(result, '')
        })

        it('Should add python comments to markdown cells', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('# Heading\nThis is markdown'), vscode.NotebookCellKind.Markup),
                createNotebookCell(createMockDocument('def example():\n    return "test"')),
            ]
            const result = EditorContext.extractPrefixCellsContext(mockCells, 100, 'python')
            assert.strictEqual(result, '# # Heading\n# This is markdown\ndef example():\n    return "test"\n')
        })

        it('Should add java comments to markdown and python cells when language is java', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('# Heading\nThis is markdown'), vscode.NotebookCellKind.Markup),
                createNotebookCell(createMockDocument('def example():\n    return "test"')),
            ]
            const result = EditorContext.extractPrefixCellsContext(mockCells, 100, 'java')
            assert.strictEqual(result, '// # Heading\n// This is markdown\n// def example():\n//     return "test"\n')
        })

        it('Should handle code cells with different languages', function () {
            const mockCells = [
                createNotebookCell(
                    createMockDocument('println(1 + 1);', 'somefile.ipynb', 'java'),
                    vscode.NotebookCellKind.Code
                ),
                createNotebookCell(createMockDocument('def example():\n    return "test"')),
            ]
            const result = EditorContext.extractPrefixCellsContext(mockCells, 100, 'python')
            assert.strictEqual(result, '# println(1 + 1);\ndef example():\n    return "test"\n')
        })
    })

    describe('extractSuffixCellsContext', function () {
        it('Should extract content from cells in order up to maxLength', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('First cell content')),
                createNotebookCell(createMockDocument('Second cell content')),
                createNotebookCell(createMockDocument('Third cell content')),
            ]

            const result = EditorContext.extractSuffixCellsContext(mockCells, 100, 'python')
            assert.strictEqual(result, 'First cell content\nSecond cell content\nThird cell content\n')
        })

        it('Should respect maxLength parameter', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('First')),
                createNotebookCell(createMockDocument('Second')),
                createNotebookCell(createMockDocument('Third')),
                createNotebookCell(createMockDocument('Fourth')),
            ]

            // Should only include first cell and part of second cell
            const result = EditorContext.extractSuffixCellsContext(mockCells, 15, 'plaintext')
            assert.strictEqual(result, 'First\nSecond\nTh')
        })

        it('Should handle empty cells array', function () {
            const result = EditorContext.extractSuffixCellsContext([], 100, 'plaintext')
            assert.strictEqual(result, '')
        })

        it('Should add python comments to markdown cells', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('# Heading\nThis is markdown'), vscode.NotebookCellKind.Markup),
                createNotebookCell(createMockDocument('def example():\n    return "test"')),
            ]

            const result = EditorContext.extractSuffixCellsContext(mockCells, 100, 'python')
            assert.strictEqual(result, '# # Heading\n# This is markdown\ndef example():\n    return "test"\n')
        })

        it('Should add java comments to markdown cells', function () {
            const mockCells = [
                createNotebookCell(createMockDocument('# Heading\nThis is markdown'), vscode.NotebookCellKind.Markup),
                createNotebookCell(
                    createMockDocument('println(1 + 1);', 'somefile.ipynb', 'java'),
                    vscode.NotebookCellKind.Code
                ),
            ]

            const result = EditorContext.extractSuffixCellsContext(mockCells, 100, 'java')
            assert.strictEqual(result, '// # Heading\n// This is markdown\nprintln(1 + 1);\n')
        })

        it('Should handle code cells with different languages', function () {
            const mockCells = [
                createNotebookCell(
                    createMockDocument('println(1 + 1);', 'somefile.ipynb', 'java'),
                    vscode.NotebookCellKind.Code
                ),
                createNotebookCell(createMockDocument('def example():\n    return "test"')),
            ]
            const result = EditorContext.extractSuffixCellsContext(mockCells, 100, 'python')
            assert.strictEqual(result, '# println(1 + 1);\ndef example():\n    return "test"\n')
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
