/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as codewhispererClient from '../../codewhisperer/client/codewhisperer'
import { vsCodeState, AcceptedSuggestionEntry, CodeSuggestionsState } from '../../codewhisperer/models/model'
import { MockDocument } from '../fake/fakeDocument'
import { getLogger } from '../../shared/logger'
import { CodeWhispererCodeCoverageTracker } from '../../codewhisperer/tracker/codewhispererCodeCoverageTracker'
import globals from '../../shared/extensionGlobals'
import { session } from '../../codewhisperer/util/codeWhispererSession'

export function resetCodeWhispererGlobalVariables() {
    vsCodeState.isIntelliSenseActive = false
    vsCodeState.isCodeWhispererEditing = false
    CodeWhispererCodeCoverageTracker.instances.clear()
    globals.telemetry.logger.clear()
    session.language = 'python'
    CodeSuggestionsState.instance.setSuggestionsEnabled(false)
}

export function createMockDocument(
    doc = 'import math\ndef two_sum(nums, target):\n',
    filename = 'test.py',
    language = 'python'
): MockDocument {
    return new MockDocument(doc, filename, sinon.spy(), language)
}

export function createMockTextEditor(
    doc = 'import math\ndef two_sum(nums, target):\n',
    filename = 'test.py',
    language = 'python',
    line = 1,
    character = 26
): vscode.TextEditor {
    const mockTextEditor: vscode.TextEditor = {
        document: createMockDocument(doc, filename, language),
        selection: createMockSelection(line, character),
        selections: [],
        visibleRanges: [],
        viewColumn: undefined,
        options: {},
        insertSnippet: sinon.spy(),
        setDecorations: sinon.spy(),
        revealRange: sinon.spy(),
        show: sinon.spy(),
        hide: sinon.spy(),
        edit: function (
            resolve: (editBuilder: vscode.TextEditorEdit) => void,
            options?: { undoStopBefore: boolean; undoStopAfter: boolean } | undefined
        ) {
            return new Promise(r => {
                const editor: vscode.TextEditorEdit = {
                    replace: sinon.spy(),
                    insert: sinon.spy(),
                    setEndOfLine: sinon.spy(),
                    delete: function (_location: vscode.Selection | vscode.Range): void {
                        getLogger().info(`delete ${JSON.stringify(_location)}`)
                    },
                }
                resolve(editor)
                r(true)
            })
        },
    }
    return mockTextEditor
}

export function createMockSelection(line: number, character: number): vscode.Selection {
    const selection: vscode.Selection = {
        anchor: new vscode.Position(line, character),
        active: new vscode.Position(line, character),
        end: new vscode.Position(line, character),
        isEmpty: false,
        isReversed: false,
        isSingleLine: false,
        start: new vscode.Position(line, character),
        contains: sinon.spy(),
        intersection: sinon.spy(),
        isEqual: sinon.spy(),
        union: sinon.spy(),
        with: sinon.spy(),
    }
    return selection
}

export function createMockClientRequest(): codewhispererClient.ListRecommendationsRequest {
    const req: codewhispererClient.ListRecommendationsRequest = {
        fileContext: {
            filename: 'test.py',
            programmingLanguage: {
                languageName: 'python',
            },
            leftFileContent: 'def add',
            rightFileContent: '',
        },
    }
    return req
}

export function createAcceptedSuggestionEntry(time = new Date()): AcceptedSuggestionEntry {
    return {
        time: time,
        fileUrl: {
            scheme: '',
            authority: 'Amazon',
            path: '',
            query: '',
            fragment: '',
            fsPath: '',
            with: sinon.spy(),
            toJSON: sinon.spy(),
        },
        originalString: 'x',
        startPosition: new vscode.Position(1, 1),
        endPosition: new vscode.Position(1, 1),
        requestId: 'test',
        sessionId: 'test',
        index: 1,
        triggerType: 'OnDemand',
        completionType: 'Line',
        language: 'java',
    }
}

export function createTextDocumentChangeEvent(document: vscode.TextDocument, range: vscode.Range, text: string) {
    return {
        reason: undefined,
        document: document,
        contentChanges: [
            {
                range: range,
                rangeOffset: 1,
                rangeLength: 1,
                text: text,
            },
        ],
    }
}
