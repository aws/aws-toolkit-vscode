/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromiseResult } from 'aws-sdk/lib/request'
import { Stub, stub } from 'aws-core-vscode/test'
import { AWSError, HttpResponse } from 'aws-sdk'
import {
    CodeAnalysisScope,
    RawCodeScanIssue,
    listScanResults,
    mapToAggregatedList,
    DefaultCodeWhispererClient,
    ListCodeScanFindingsResponse,
} from 'aws-core-vscode/codewhisperer'
import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import fs from 'fs' // eslint-disable-line no-restricted-imports

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
    } satisfies RawCodeScanIssue,
])

const mockListCodeScanFindingsResponse: Awaited<Promise<PromiseResult<ListCodeScanFindingsResponse, AWSError>>> = {
    $response: {
        hasNextPage: () => false,
        nextPage: () => undefined,
        data: undefined,
        error: undefined,
        requestId: '',
        redirectCount: 0,
        retryCount: 0,
        httpResponse: new HttpResponse(),
    },
    codeScanFindings: mockCodeScanFindings,
}

// eslint-disable-next-line id-length
const mockListCodeScanFindingsPaginatedResponse: Awaited<
    Promise<PromiseResult<ListCodeScanFindingsResponse, AWSError>>
> = {
    ...mockListCodeScanFindingsResponse,
    nextToken: 'nextToken',
}

describe('securityScanHandler', function () {
    describe('listScanResults', function () {
        let mockClient: Stub<DefaultCodeWhispererClient>
        beforeEach(function () {
            mockClient = stub(DefaultCodeWhispererClient)
            sinon.stub(fs, 'existsSync').returns(true)
            sinon.stub(fs, 'statSync').returns({ isFile: () => true } as fs.Stats)
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should make ListCodeScanFindings request and aggregate findings by file path', async function () {
            mockClient.listCodeScanFindings.resolves(mockListCodeScanFindingsResponse)

            const aggregatedCodeScanIssueList = await listScanResults(
                mockClient,
                'jobId',
                'codeScanFindingsSchema',
                ['projectPath'],
                CodeAnalysisScope.PROJECT,
                undefined
            )

            assert.equal(aggregatedCodeScanIssueList.length, 2)
            assert.equal(aggregatedCodeScanIssueList[0].issues.length, 1)
            assert.equal(aggregatedCodeScanIssueList[1].issues.length, 1)
        })

        it('should handle ListCodeScanFindings request with paginated response', async function () {
            mockClient.listCodeScanFindings
                .onFirstCall()
                .resolves(mockListCodeScanFindingsPaginatedResponse)
                .onSecondCall()
                .resolves(mockListCodeScanFindingsPaginatedResponse)
                .onThirdCall()
                .resolves(mockListCodeScanFindingsResponse)

            const aggregatedCodeScanIssueList = await listScanResults(
                mockClient,
                'jobId',
                'codeScanFindingsSchema',
                ['projectPath'],
                CodeAnalysisScope.PROJECT,
                undefined
            )

            assert.equal(aggregatedCodeScanIssueList.length, 2)
            assert.equal(aggregatedCodeScanIssueList[0].issues.length, 3)
        })
    })

    describe('mapToAggregatedList', () => {
        let codeScanIssueMap: Map<string, RawCodeScanIssue[]>
        let editor: vscode.TextEditor | undefined

        beforeEach(() => {
            codeScanIssueMap = new Map()
            editor = {
                document: {
                    lineAt: (lineNumber: number): vscode.TextLine => ({
                        lineNumber: lineNumber + 1,
                        range: new vscode.Range(0, 0, 0, 0),
                        rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 0),
                        firstNonWhitespaceCharacterIndex: 0,
                        isEmptyOrWhitespace: false,
                        text: `line ${lineNumber + 1}`,
                    }),
                },
            } as vscode.TextEditor
        })

        it('should aggregate issues by file path', () => {
            const json = JSON.stringify([
                {
                    filePath: 'file1.ts',
                    startLine: 1,
                    endLine: 2,
                    codeSnippet: [
                        { number: 1, content: 'line 1' },
                        { number: 2, content: 'line 2' },
                    ],
                },
                { filePath: 'file2.ts', startLine: 1, endLine: 1, codeSnippet: [{ number: 1, content: 'line 1' }] },
            ])

            mapToAggregatedList(codeScanIssueMap, json, editor, CodeAnalysisScope.FILE)

            assert.equal(codeScanIssueMap.size, 2)
            assert.equal(codeScanIssueMap.get('file1.ts')?.length, 1)
            assert.equal(codeScanIssueMap.get('file2.ts')?.length, 1)
        })

        it('should filter issues based on the scope', () => {
            const json = JSON.stringify([
                {
                    filePath: 'file1.ts',
                    startLine: 1,
                    endLine: 2,
                    codeSnippet: [
                        { number: 1, content: 'line 1' },
                        { number: 2, content: 'line 2' },
                    ],
                },
                { filePath: 'file1.ts', startLine: 3, endLine: 3, codeSnippet: [{ number: 3, content: 'line 3' }] },
            ])

            mapToAggregatedList(codeScanIssueMap, json, editor, CodeAnalysisScope.FILE)

            assert.equal(codeScanIssueMap.size, 1)
            assert.equal(codeScanIssueMap.get('file1.ts')?.length, 2)
        })

        it('should handle issue filtering with redacted code', () => {
            const json = JSON.stringify([
                {
                    filePath: 'file1.ts',
                    startLine: 1,
                    endLine: 2,
                    codeSnippet: [
                        { number: 1, content: '**** *' },
                        { number: 2, content: '**** *' },
                    ],
                },
                { filePath: 'file1.ts', startLine: 3, endLine: 3, codeSnippet: [{ number: 3, content: '**** **' }] },
            ])

            mapToAggregatedList(codeScanIssueMap, json, editor, CodeAnalysisScope.FILE)
            assert.strictEqual(codeScanIssueMap.size, 1)
            assert.strictEqual(codeScanIssueMap.get('file1.ts')?.length, 1)
        })
    })
})
