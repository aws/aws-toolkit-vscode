/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { SvgGenerationService } from '../../../../../src/app/inline/EditRendering/svgGenerator'

describe('SvgGenerationService', function () {
    let sandbox: sinon.SinonSandbox
    let service: SvgGenerationService
    let documentStub: sinon.SinonStubbedInstance<vscode.TextDocument>
    let workspaceStub: sinon.SinonStubbedInstance<typeof vscode.workspace>
    let editorConfigStub: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Create stubs for vscode objects and utilities
        documentStub = {
            getText: sandbox.stub().returns('function example() {\n  return 42;\n}'),
            lineCount: 3,
            lineAt: sandbox.stub().returns({
                text: 'Line content',
                range: new vscode.Range(0, 0, 0, 12),
            }),
        } as unknown as sinon.SinonStubbedInstance<vscode.TextDocument>

        workspaceStub = sandbox.stub(vscode.workspace)
        workspaceStub.openTextDocument.resolves(documentStub as unknown as vscode.TextDocument)
        workspaceStub.getConfiguration = sandbox.stub()

        editorConfigStub = {
            get: sandbox.stub(),
        }
        editorConfigStub.get.withArgs('fontSize').returns(14)
        editorConfigStub.get.withArgs('lineHeight').returns(0)

        // Create the service instance
        service = new SvgGenerationService()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('generateDiffSvg', function () {
        it('should handle empty original code', async function () {
            // Create a new document stub for this test with empty content
            const emptyDocStub = {
                getText: sandbox.stub().returns(''),
                lineCount: 0,
                lineAt: sandbox.stub().returns({
                    text: '',
                    range: new vscode.Range(0, 0, 0, 0),
                }),
            } as unknown as vscode.TextDocument

            // Make openTextDocument return our empty document
            workspaceStub.openTextDocument.resolves(emptyDocStub as unknown as vscode.TextDocument)

            // A simple unified diff
            const udiff = '--- a/example.js\n+++ b/example.js\n@@ -0,0 +1,1 @@\n+function example() {}\n'

            // Expect an error to be thrown
            try {
                await service.generateDiffSvg('example.js', udiff)
                assert.fail('Expected an error to be thrown')
            } catch (error) {
                assert.ok(error)
                assert.strictEqual((error as Error).message, 'udiff format error')
            }
        })
    })

    describe('theme handling', function () {
        it('should generate correct styles for dark theme', function () {
            // Configure for dark theme
            workspaceStub.getConfiguration.withArgs('editor').returns(editorConfigStub)
            workspaceStub.getConfiguration.withArgs('workbench').returns({
                get: sandbox.stub().withArgs('colorTheme', 'Default').returns('Dark+ (default dark)'),
            } as any)

            const getEditorTheme = (service as any).getEditorTheme.bind(service)
            const theme = getEditorTheme()

            assert.strictEqual(theme.fontSize, 14)
            assert.strictEqual(theme.lingHeight, 21) // 1.5 * 14
            assert.strictEqual(theme.foreground, 'rgba(212, 212, 212, 1)')
            assert.strictEqual(theme.background, 'rgba(30, 30, 30, 1)')
        })

        it('should generate correct styles for light theme', function () {
            // Reconfigure for light theme
            editorConfigStub.get.withArgs('fontSize', 12).returns(12)

            workspaceStub.getConfiguration.withArgs('editor').returns(editorConfigStub)
            workspaceStub.getConfiguration.withArgs('workbench').returns({
                get: sandbox.stub().withArgs('colorTheme', 'Default').returns('Light+ (default light)'),
            } as any)

            const getEditorTheme = (service as any).getEditorTheme.bind(service)
            const theme = getEditorTheme()

            assert.strictEqual(theme.fontSize, 12)
            assert.strictEqual(theme.lingHeight, 18) // 1.5 * 12
            assert.strictEqual(theme.foreground, 'rgba(0, 0, 0, 1)')
            assert.strictEqual(theme.background, 'rgba(255, 255, 255, 1)')
        })

        it('should handle custom line height settings', function () {
            // Reconfigure for custom line height
            editorConfigStub.get.withArgs('fontSize').returns(16)
            editorConfigStub.get.withArgs('lineHeight').returns(2.5)

            workspaceStub.getConfiguration.withArgs('editor').returns(editorConfigStub)
            workspaceStub.getConfiguration.withArgs('workbench').returns({
                get: sandbox.stub().withArgs('colorTheme', 'Default').returns('Dark+ (default dark)'),
            } as any)

            const getEditorTheme = (service as any).getEditorTheme.bind(service)
            const theme = getEditorTheme()

            assert.strictEqual(theme.fontSize, 16)
            assert.strictEqual(theme.lingHeight, 40) // 2.5 * 16
        })

        it('should generate CSS styles correctly', function () {
            const theme = {
                fontSize: 14,
                lingHeight: 21,
                foreground: 'rgba(212, 212, 212, 1)',
                background: 'rgba(30, 30, 30, 1)',
                diffAdded: 'rgba(231, 245, 231, 0.2)',
                diffRemoved: 'rgba(255, 0, 0, 0.2)',
            }

            const generateStyles = (service as any).generateStyles.bind(service)
            const styles = generateStyles(theme)

            assert.ok(styles.includes('font-size: 14px'))
            assert.ok(styles.includes('line-height: 21px'))
            assert.ok(styles.includes('color: rgba(212, 212, 212, 1)'))
            assert.ok(styles.includes('background-color: rgba(30, 30, 30, 1)'))
            assert.ok(styles.includes('.diff-changed'))
            assert.ok(styles.includes('.diff-removed'))
        })
    })

    describe('highlight ranges', function () {
        it('should generate highlight ranges for character-level changes', function () {
            const originalCode = ['function test() {', '  return 42;', '}']
            const afterCode = ['function test() {', '  return 100;', '}']
            const modifiedLines = new Map([['  return 42;', '  return 100;']])

            const generateHighlightRanges = (service as any).generateHighlightRanges.bind(service)
            const result = generateHighlightRanges(originalCode, afterCode, modifiedLines)

            // Should have ranges for the changed characters
            assert.ok(result.removedRanges.length > 0)
            assert.ok(result.addedRanges.length > 0)

            // Check that ranges are properly formatted
            const removedRange = result.removedRanges[0]
            assert.ok(removedRange.line >= 0)
            assert.ok(removedRange.start >= 0)
            assert.ok(removedRange.end > removedRange.start)

            const addedRange = result.addedRanges[0]
            assert.ok(addedRange.line >= 0)
            assert.ok(addedRange.start >= 0)
            assert.ok(addedRange.end > addedRange.start)
        })

        it('should merge adjacent highlight ranges', function () {
            const originalCode = ['function test() {', '  return 42;', '}']
            const afterCode = ['function test() {', '  return 100;', '}']
            const modifiedLines = new Map([['  return 42;', '  return 100;']])

            const generateHighlightRanges = (service as any).generateHighlightRanges.bind(service)
            const result = generateHighlightRanges(originalCode, afterCode, modifiedLines)

            // Adjacent ranges should be merged
            const sortedRanges = [...result.addedRanges].sort((a, b) => {
                if (a.line !== b.line) {
                    return a.line - b.line
                }
                return a.start - b.start
            })

            // Check that no adjacent ranges exist
            for (let i = 0; i < sortedRanges.length - 1; i++) {
                const current = sortedRanges[i]
                const next = sortedRanges[i + 1]
                if (current.line === next.line) {
                    assert.ok(next.start - current.end > 1, 'Adjacent ranges should be merged')
                }
            }
        })

        it('should handle HTML escaping in highlight edits', function () {
            const newLines = ['function test() {', '  return "<script>alert(1)</script>";', '}']
            const highlightRanges = [{ line: 1, start: 10, end: 35 }]

            const getHighlightEdit = (service as any).getHighlightEdit.bind(service)
            const result = getHighlightEdit(newLines, highlightRanges)

            assert.ok(result[1].includes('&lt;script&gt;'))
            assert.ok(result[1].includes('&lt;/script&gt;'))
            assert.ok(result[1].includes('diff-changed'))
        })
    })

    describe('dimensions and positioning', function () {
        it('should calculate dimensions correctly', function () {
            const newLines = ['function test() {', '  return 42;', '}']
            const theme = {
                fontSize: 14,
                lingHeight: 21,
                foreground: 'rgba(212, 212, 212, 1)',
                background: 'rgba(30, 30, 30, 1)',
            }

            const calculateDimensions = (service as any).calculateDimensions.bind(service)
            const result = calculateDimensions(newLines, theme)

            assert.strictEqual(result.width, 287)
            assert.strictEqual(result.height, 109)
            assert.ok(result.height >= (newLines.length + 1) * theme.lingHeight)
        })

        it('should calculate position offset correctly', function () {
            const originalLines = ['function test() {', '  return 42;', '}']
            const newLines = ['function test() {', '  return 100;', '}']
            const diffLines = ['  return 100;']
            const theme = {
                fontSize: 14,
                lingHeight: 21,
                foreground: 'rgba(212, 212, 212, 1)',
                background: 'rgba(30, 30, 30, 1)',
            }

            const calculatePosition = (service as any).calculatePosition.bind(service)
            const result = calculatePosition(originalLines, newLines, diffLines, theme)

            assert.strictEqual(result.offset, 10)
            assert.strictEqual(result.editStartLine, 1)
        })
    })

    describe('HTML content generation', function () {
        it('should generate HTML content with proper structure', function () {
            const diffLines = ['function test() {', '  return 42;', '}']
            const styles = '.code-container { color: white; }'
            const offset = 20

            const generateHtmlContent = (service as any).generateHtmlContent.bind(service)
            const result = generateHtmlContent(diffLines, styles, offset)

            assert.ok(result.includes('<div xmlns="http://www.w3.org/1999/xhtml">'))
            assert.ok(result.includes('<style>'))
            assert.ok(result.includes('margin-left: 20px'))
            assert.ok(result.includes('Q: Press [Tab] to accept or [Esc] to reject:'))
            assert.ok(result.includes('function test() {'))
        })

        it('should escape HTML characters properly', function () {
            const escapeHtml = (service as any).escapeHtml.bind(service)

            assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;')
            assert.strictEqual(escapeHtml('&amp;'), '&amp;amp;')
            assert.strictEqual(escapeHtml('"quoted"'), '&quot;quoted&quot;')
            assert.strictEqual(escapeHtml("'quoted'"), '&#039;quoted&#039;')
        })
    })
})
