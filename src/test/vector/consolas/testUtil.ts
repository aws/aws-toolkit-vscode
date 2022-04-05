/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as consolasClient from '../../../vector/consolas/client/consolas'
import {
    recommendations,
    invocationContext,
    AcceptedSuggestionEntry,
    automatedTriggerContext,
    telemetryContext,
} from '../../../vector/consolas/models/model'
import { ConsolasConstants } from '../../../vector/consolas/models/constants'
import { MockDocument } from './mockDocument'
import { getLogger } from '../../../shared/logger'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'

const performance = globalThis.performance ?? require('perf_hooks').performance

export function resetConsolasGlobalVariables() {
    recommendations.requestId = ''
    recommendations.response = []
    invocationContext.isActive = false
    invocationContext.isPendingResponse = false
    automatedTriggerContext.specialChar = ''
    automatedTriggerContext.keyStrokeCount = 0
    invocationContext.lastInvocationTime =
        performance.now() - ConsolasConstants.INVOCATION_TIME_INTERVAL_THRESHOLD * 1000
    invocationContext.startPos = new vscode.Position(0, 0)
    telemetryContext.isPrefixMatched = []
    telemetryContext.triggerType = 'OnDemand'
    telemetryContext.ConsolasAutomatedtriggerType = 'KeyStrokeCount'
    telemetryContext.completionType = 'Line'
    telemetryContext.cursorOffset = 0
    runtimeLanguageContext.languageContexts = {
        plaintext: {
            language: 'plaintext',
            runtimeLanguage: 'unknown',
            runtimeLanguageSource: '',
        },
        python: {
            language: 'python',
            runtimeLanguage: 'python2',
            runtimeLanguageSource: '2.7.16',
        },
        javascript: {
            language: 'javascript',
            runtimeLanguage: 'javascript',
            runtimeLanguageSource: '12.22.9',
        },
        java: {
            language: 'java',
            runtimeLanguage: 'java11',
            runtimeLanguageSource: '11.0.13',
        },
    }
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

export function createMockClientRequest(maxrecommendations = 10): consolasClient.ConsolasGenerateRecommendationsReq {
    const req: consolasClient.ConsolasGenerateRecommendationsReq = {
        contextInfo: {
            filename: 'test.py',
            naturalLanguageCode: 'en-US',
            programmingLanguage: {
                languageName: 'python',
                runtimeVersion: '2.7.10',
            },
        },
        fileContext: {
            leftFileContent: 'def add',
            rightFileContent: '',
        },
        maxRecommendations: maxrecommendations,
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
        index: 1,
        triggerType: 'OnDemand',
        completionType: 'Line',
        language: 'java',
        languageRuntime: 'java11',
        languageRuntimeSource: '11.0.13',
    }
}

export function createTextDocumentChangeEvent(document: vscode.TextDocument, range: vscode.Range, text: string) {
    return {
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
