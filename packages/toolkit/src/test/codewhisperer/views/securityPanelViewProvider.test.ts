/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { SecurityPanelViewProvider } from '../../../codewhisperer/views/securityPanelViewProvider'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { AggregatedCodeScanIssue, CodeScanIssue } from '../../../codewhisperer/models/model'
import { createMockTextEditor, createTextDocumentChangeEvent } from '../testUtil'
import { TextEditorDecorationType, Range } from 'vscode'

const codeScanIssue: CodeScanIssue[] = [
    {
        startLine: 0,
        endLine: 4,
        comment: 'foo',
        title: 'bar',
        description: {
            text: 'foo',
            markdown: 'foo',
        },
        detectorId: '',
        detectorName: '',
        findingId: '',
        relatedVulnerabilities: [],
        severity: 'low',
        recommendation: { text: 'foo', url: 'foo' },
        suggestedFixes: [],
    },
]

const aggregatedCodeScanIssue: AggregatedCodeScanIssue[] = [
    {
        filePath: '/test.py',
        issues: codeScanIssue,
    },
]

describe('securityPanelViewProvider', function () {
    let decorationCalled: boolean
    let editorDecorationType: TextEditorDecorationType | undefined
    let editorRangesOrOptions: Range[] | undefined
    let mockEditor: vscode.TextEditor
    let mockExtensionContext: vscode.ExtensionContext
    let securityPanelViewProvider: SecurityPanelViewProvider

    function setDecorationsArgs(decorationType: TextEditorDecorationType, rangesOrOptions: Range[]): void {
        decorationCalled = true
        editorDecorationType = decorationType
        editorRangesOrOptions = rangesOrOptions
    }

    function createEditor() {
        const editor = createMockTextEditor()
        editor.setDecorations = setDecorationsArgs
        return editor
    }

    beforeEach(async function () {
        decorationCalled = false
        editorDecorationType = undefined
        editorRangesOrOptions = []
        mockEditor = createEditor()
        mockExtensionContext = await FakeExtensionContext.create()
        securityPanelViewProvider = new SecurityPanelViewProvider(mockExtensionContext)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('should add lines to panel and add decorations to editor when adding lines', async function () {
        securityPanelViewProvider.addLines(aggregatedCodeScanIssue, mockEditor)
        assert.ok(decorationCalled)
        assert.strictEqual(editorRangesOrOptions?.length, 1)
        assert.ok(editorDecorationType?.key !== undefined)
    })

    it('should dispose security panel item', async function () {
        const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
            mockEditor.document,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
            'bar'
        )

        securityPanelViewProvider.addLines(aggregatedCodeScanIssue, mockEditor)
        assert.strictEqual(editorRangesOrOptions?.length, 1)

        securityPanelViewProvider.disposeSecurityPanelItem(mockEvent, mockEditor)
        assert.ok(decorationCalled)
        assert.strictEqual(editorRangesOrOptions?.length, 0)
    })
})
