/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as codewhispererClient from '../../codewhisperer/client/codewhisperer'
import {
    vsCodeState,
    AcceptedSuggestionEntry,
    CodeScanIssue,
    CodeSuggestionsState,
} from '../../codewhisperer/models/model'
import { MockDocument } from '../fake/fakeDocument'
import { getLogger } from '../../shared/logger'
import { CodeWhispererCodeCoverageTracker } from '../../codewhisperer/tracker/codewhispererCodeCoverageTracker'
import globals from '../../shared/extensionGlobals'
import { session } from '../../codewhisperer/util/codeWhispererSession'
import { DefaultAWSClientBuilder, ServiceOptions } from '../../shared/awsClientBuilder'
import { FakeAwsContext } from '../utilities/fakeAwsContext'
import { HttpResponse, Service } from 'aws-sdk'
import userApiConfig = require('./../../codewhisperer/client/user-service-2.json')
import CodeWhispererUserClient = require('../../codewhisperer/client/codewhispereruserclient')
import { codeWhispererClient } from '../../codewhisperer/client/codewhisperer'
import { RecommendationHandler } from '../../codewhisperer/service/recommendationHandler'
import * as model from '../../codewhisperer/models/model'
import { stub } from '../utilities/stubber'
import { Dirent } from 'fs' // eslint-disable-line no-restricted-imports

export async function resetCodeWhispererGlobalVariables(clearGlobalState: boolean = true) {
    vsCodeState.isIntelliSenseActive = false
    vsCodeState.isCodeWhispererEditing = false
    CodeWhispererCodeCoverageTracker.instances.clear()
    globals.telemetry.logger.clear()
    session.reset()
    if (clearGlobalState) {
        await globals.globalState.clear()
    }
    await CodeSuggestionsState.instance.setSuggestionsEnabled(true)
    await RecommendationHandler.instance.clearInlineCompletionStates()
}

export function createMockDocument(
    doc = 'import math\ndef two_sum(nums, target):\n',
    filename = 'test.py',
    language = 'python'
): MockDocument {
    return new MockDocument(
        doc,
        filename,
        sinon.spy(async (_doc) => true),
        language
    )
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
            return new Promise((r) => {
                const editor: vscode.TextEditorEdit = {
                    replace: sinon.spy(),
                    insert: sinon.spy(),
                    setEndOfLine: sinon.spy(),
                    delete: function (_location: vscode.Selection | vscode.Range): void {
                        getLogger().info(`delete %O`, _location)
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

// bryceitoc9: I'm not sure what this function does? spy functionality from Mockito wasn't used, and removing doesn't break anything
export async function createSpyClient() {
    const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
    const clientSpy = (await builder.createAwsService(Service, {
        apiConfig: userApiConfig,
    } as ServiceOptions)) as CodeWhispererUserClient
    sinon.stub(codeWhispererClient, 'createUserSdkClient').returns(Promise.resolve(clientSpy))
    return clientSpy
}

export function createCodeScanIssue(overrides?: Partial<CodeScanIssue>): CodeScanIssue {
    return {
        startLine: 0,
        endLine: 1,
        comment: 'comment',
        title: 'title',
        description: {
            text: 'description',
            markdown: 'description',
        },
        detectorId: 'language/cool-detector@v1.0',
        detectorName: 'detectorName',
        findingId: 'findingId',
        relatedVulnerabilities: ['CWE-1'],
        severity: 'High',
        recommendation: {
            text: 'recommendationText',
            url: 'recommendationUrl',
        },
        suggestedFixes: [
            { description: 'fix', code: '@@ -1,1 +1,1 @@\nfirst line\n-second line\n+third line\nfourth line' },
        ],
        visible: true,
        language: 'python',
        scanJobId: 'scanJob',
        ...overrides,
    }
}

export function createCodeActionContext(): vscode.CodeActionContext {
    return {
        diagnostics: [],
        only: vscode.CodeActionKind.Empty,
        triggerKind: vscode.CodeActionTriggerKind.Automatic,
    }
}

export function createMockDirentFile(fileName: string): Dirent {
    const dirent = new Dirent()
    dirent.isFile = () => true
    dirent.name = fileName
    return dirent
}

export const mockGetCodeScanResponse = {
    $response: {
        data: {
            status: 'Completed',
        },
        requestId: 'requestId',
        hasNextPage: () => false,
        error: undefined,
        nextPage: () => null, // eslint-disable-line unicorn/no-null
        redirectCount: 0,
        retryCount: 0,
        httpResponse: new HttpResponse(),
    },
    status: 'Completed',
}

export function createClient() {
    const mockClient = stub(codewhispererClient.DefaultCodeWhispererClient)

    const mockCreateCodeScanResponse = {
        $response: {
            data: {
                jobId: 'jobId',
                status: 'Pending',
            },
            requestId: 'requestId',
            hasNextPage: () => false,
            error: undefined,
            nextPage: () => null, // eslint-disable-line unicorn/no-null
            redirectCount: 0,
            retryCount: 0,
            httpResponse: new HttpResponse(),
        },
        jobId: 'jobId',
        status: 'Pending',
    }
    const mockCreateUploadUrlResponse = {
        $response: {
            data: {
                uploadId: 'uploadId',
                uploadUrl: 'uploadUrl',
            },
            requestId: 'requestId',
            hasNextPage: () => false,
            error: undefined,
            nextPage: () => null, // eslint-disable-line unicorn/no-null
            redirectCount: 0,
            retryCount: 0,
            httpResponse: new HttpResponse(),
        },
        uploadId: 'uploadId',
        uploadUrl: 'https://test.com',
    }

    const mockCodeScanFindings = JSON.stringify([
        {
            filePath: 'workspaceFolder/python3.7-plain-sam-app/hello_world/app.py',
            startLine: 1,
            endLine: 1,
            title: 'title',
            description: {
                text: 'text',
                markdown: 'markdown',
            },
            detectorId: 'detectorId',
            detectorName: 'detectorName',
            findingId: 'findingId',
            relatedVulnerabilities: [],
            severity: 'High',
            remediation: {
                recommendation: {
                    text: 'text',
                    url: 'url',
                },
                suggestedFixes: [],
            },
            codeSnippet: [],
        } satisfies model.RawCodeScanIssue,
    ])

    const mockListCodeScanFindingsResponse = {
        $response: {
            data: {
                codeScanFindings: mockCodeScanFindings,
            },
            requestId: 'requestId',
            hasNextPage: () => false,
            error: undefined,
            nextPage: () => null, // eslint-disable-line unicorn/no-null
            redirectCount: 0,
            retryCount: 0,
            httpResponse: new HttpResponse(),
        },
        codeScanFindings: mockCodeScanFindings,
    }

    mockClient.createCodeScan.resolves(mockCreateCodeScanResponse)
    mockClient.createUploadUrl.resolves(mockCreateUploadUrlResponse)
    mockClient.getCodeScan.resolves(mockGetCodeScanResponse)
    mockClient.listCodeScanFindings.resolves(mockListCodeScanFindingsResponse)
    return mockClient
}

export function aStringWithLineCount(lineCount: number, start: number = 0): string {
    let s = ''
    for (let i = start; i < start + lineCount; i++) {
        s += `line${i}\n`
    }

    return s.trimEnd()
}

export function aLongStringWithLineCount(lineCount: number, start: number = 0): string {
    let s = ''
    for (let i = start; i < start + lineCount; i++) {
        s += `a`.repeat(100) + `line${i}\n`
    }

    return s.trimEnd()
}
