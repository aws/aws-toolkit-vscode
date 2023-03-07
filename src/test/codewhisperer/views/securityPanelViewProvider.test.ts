/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { SecurityPanelViewProvider } from '../../../codewhisperer/views/securityPanelViewProvider'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { closeAllEditors } from '../../testUtil'
import { AggregatedCodeScanIssue, CodeScanIssue } from '../../../codewhisperer/models/model'
import { createMockTextEditor, createTextDocumentChangeEvent } from '../testUtil'
import { TextEditorDecorationType, Range } from 'vscode'

let decorationCalled: boolean
let editorDecorationType: TextEditorDecorationType | undefined
let editorRangesOrOptions: Range[] | undefined

function createEditor(){
    const editor = createMockTextEditor()
    editor.setDecorations = setDecorationsArgs
    return editor
}

const codeScanIssue: CodeScanIssue[] = [{
    startLine: 0,
    endLine: 4, 
    comment: 'foo'
}]

const aggregatedCodeScanIssue: AggregatedCodeScanIssue[] = [{
    filePath: '/test.py',
    issues: codeScanIssue
}]

function setDecorationsArgs (decorationType: TextEditorDecorationType, rangesOrOptions: Range[]): void {
    decorationCalled = true
    editorDecorationType = decorationType
    editorRangesOrOptions = rangesOrOptions
}

describe('securityPanelViewProvider', function () {
    afterEach(function () {
        sinon.restore()
    })
    after(function () {
        closeAllEditors()
    })

    it('should add lines and add decorations to editor when adding lines', async function() {
        decorationCalled = false
        editorRangesOrOptions = []
        const mockEditor = createEditor()
        const extensionContext = await FakeExtensionContext.create()
        const securityPanelViewProvider = new SecurityPanelViewProvider(extensionContext)
        
        securityPanelViewProvider.addLines(aggregatedCodeScanIssue, mockEditor)
        assert.ok(decorationCalled)
        assert.strictEqual(editorRangesOrOptions?.length, 1)
        assert.ok(editorDecorationType?.key !== undefined)
        decorationCalled = false
        
        securityPanelViewProvider.addLines(aggregatedCodeScanIssue, mockEditor)
        assert.ok(decorationCalled)
        assert.strictEqual(editorRangesOrOptions?.length, 2)
        assert.ok(editorDecorationType?.key !== undefined)
    })

    it('should dispose security panel item', async function() {
        decorationCalled = false
        editorRangesOrOptions = []
        const mockEditor = createEditor()
        const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
            mockEditor.document,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
            'bar'
        )
        const extensionContext = await FakeExtensionContext.create()
        const securityPanelViewProvider = new SecurityPanelViewProvider(extensionContext)
        
        securityPanelViewProvider.addLines(aggregatedCodeScanIssue, mockEditor)
        securityPanelViewProvider.disposeSecurityPanelItem(mockEvent, mockEditor)

        assert.ok(decorationCalled)
        assert.strictEqual(editorRangesOrOptions?.length, 0)
    })
})
