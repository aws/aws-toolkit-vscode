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
    pollScanJobStatus,
    SecurityScanTimedOutError,
    generateScanName,
} from 'aws-core-vscode/codewhisperer'
import { getStringHash, timeoutUtils } from 'aws-core-vscode/shared'
import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import fs from 'fs' // eslint-disable-line no-restricted-imports

const buildRawCodeScanIssue = (params?: Partial<RawCodeScanIssue>): RawCodeScanIssue => ({
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
    ...params,
})

const buildMockListCodeScanFindingsResponse = (
    codeScanFindings: string = JSON.stringify([buildRawCodeScanIssue()]),
    nextToken?: boolean
): Awaited<Promise<PromiseResult<ListCodeScanFindingsResponse, AWSError>>> => ({
    $response: {
        hasNextPage: () => false,
        nextPage: () => null, // eslint-disable-line unicorn/no-null
        data: undefined,
        error: undefined,
        requestId: '',
        redirectCount: 0,
        retryCount: 0,
        httpResponse: new HttpResponse(),
    },
    codeScanFindings,
    nextToken: nextToken ? 'nextToken' : undefined,
})

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
            mockClient.listCodeScanFindings.resolves(buildMockListCodeScanFindingsResponse())

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
                .resolves(
                    buildMockListCodeScanFindingsResponse(
                        JSON.stringify([buildRawCodeScanIssue({ title: 'title1' })]),
                        true
                    )
                )
                .onSecondCall()
                .resolves(
                    buildMockListCodeScanFindingsResponse(
                        JSON.stringify([buildRawCodeScanIssue({ title: 'title2' })]),
                        true
                    )
                )
                .onThirdCall()
                .resolves(
                    buildMockListCodeScanFindingsResponse(
                        JSON.stringify([buildRawCodeScanIssue({ title: 'title3' })]),
                        false
                    )
                )

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

        it('should set autoDetected based on scope', async function () {
            mockClient.listCodeScanFindings.resolves(
                buildMockListCodeScanFindingsResponse(JSON.stringify([buildRawCodeScanIssue()]))
            )
            for (const [scope, expectedValue] of [
                [CodeAnalysisScope.FILE_AUTO, true],
                [CodeAnalysisScope.FILE_ON_DEMAND, false],
                [CodeAnalysisScope.PROJECT, false],
            ] as [CodeAnalysisScope, boolean][]) {
                const aggregatedCodeScanIssueList = await listScanResults(
                    mockClient,
                    'jobId',
                    'codeScanFindingsSchema',
                    ['projectPath'],
                    scope,
                    undefined
                )
                assert.ok(
                    aggregatedCodeScanIssueList.every((item) =>
                        item.issues.every((issue) => issue.autoDetected === expectedValue)
                    )
                )
            }
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

            mapToAggregatedList(codeScanIssueMap, json, editor, CodeAnalysisScope.FILE_AUTO)

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

            mapToAggregatedList(codeScanIssueMap, json, editor, CodeAnalysisScope.FILE_AUTO)

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

            mapToAggregatedList(codeScanIssueMap, json, editor, CodeAnalysisScope.FILE_AUTO)
            assert.strictEqual(codeScanIssueMap.size, 1)
            assert.strictEqual(codeScanIssueMap.get('file1.ts')?.length, 1)
        })

        it('should handle duplicate issues', function () {
            const json = JSON.stringify([
                {
                    filePath: 'file1.ts',
                    startLine: 1,
                    endLine: 2,
                    title: 'duplicate issue',
                    codeSnippet: [
                        { number: 1, content: 'line 1' },
                        { number: 2, content: 'line 2' },
                    ],
                },
                {
                    filePath: 'file1.ts',
                    startLine: 1,
                    endLine: 2,
                    title: 'duplicate issue',
                    codeSnippet: [
                        { number: 1, content: 'line 1' },
                        { number: 2, content: 'line 2' },
                    ],
                },
            ])

            mapToAggregatedList(codeScanIssueMap, json, editor, CodeAnalysisScope.FILE_AUTO)
            assert.strictEqual(codeScanIssueMap.size, 1)
            assert.strictEqual(codeScanIssueMap.get('file1.ts')?.length, 1)
        })
    })

    describe('pollScanJobStatus', function () {
        let mockClient: Stub<DefaultCodeWhispererClient>
        let clock: sinon.SinonFakeTimers
        const mockJobId = 'test-job-id'
        const mockStartTime = Date.now()

        beforeEach(function () {
            mockClient = stub(DefaultCodeWhispererClient)
            clock = sinon.useFakeTimers({
                shouldAdvanceTime: true,
            })
            sinon.stub(timeoutUtils, 'sleep').resolves()
        })

        afterEach(function () {
            sinon.restore()
            clock.restore()
        })

        it('should return status when scan completes successfully', async function () {
            mockClient.getCodeScan
                .onFirstCall()
                .resolves({ status: 'Pending', $response: { requestId: 'req1' } })
                .onSecondCall()
                .resolves({ status: 'Completed', $response: { requestId: 'req2' } })

            const result = await pollScanJobStatus(mockClient, mockJobId, CodeAnalysisScope.FILE_AUTO, mockStartTime)
            assert.strictEqual(result, 'Completed')
        })

        it('should throw SecurityScanTimedOutError when polling exceeds timeout for express scans', async function () {
            mockClient.getCodeScan.resolves({ status: 'Pending', $response: { requestId: 'req1' } })

            const pollPromise = pollScanJobStatus(mockClient, mockJobId, CodeAnalysisScope.FILE_AUTO, mockStartTime)

            const expectedTimeoutMs = 60_000
            clock.tick(expectedTimeoutMs + 1000)

            await assert.rejects(() => pollPromise, SecurityScanTimedOutError)
        })

        it('should throw SecurityScanTimedOutError when polling exceeds timeout for standard scans', async function () {
            mockClient.getCodeScan.resolves({ status: 'Pending', $response: { requestId: 'req1' } })

            const pollPromise = pollScanJobStatus(mockClient, mockJobId, CodeAnalysisScope.PROJECT, mockStartTime)

            const expectedTimeoutMs = 600_000
            clock.tick(expectedTimeoutMs + 1000)

            await assert.rejects(() => pollPromise, SecurityScanTimedOutError)
        })
    })

    describe('generateScanName', function () {
        const clientId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

        it('should generate scan name for FILE_AUTO scope', function () {
            const result = generateScanName(['/some/root/path'], CodeAnalysisScope.FILE_AUTO, '/path/to/some/file')
            assert.strictEqual(result, getStringHash(`${clientId}::/path/to/some/file::FILE_AUTO`))
        })

        it('should generate scan name for FILE_ON_DEMAND scope', function () {
            const result = generateScanName(['/some/root/path'], CodeAnalysisScope.FILE_ON_DEMAND, '/path/to/some/file')
            assert.strictEqual(result, getStringHash(`${clientId}::/path/to/some/file::FILE_ON_DEMAND`))
        })

        it('should generate scan name for PROJECT scope with a single project root', function () {
            const result = generateScanName(['/some/root/path'], CodeAnalysisScope.PROJECT)
            assert.strictEqual(result, getStringHash(`${clientId}::/some/root/path::PROJECT`))
        })

        it('should generate scan name for PROJECT scope with multiple project roots', function () {
            const result = generateScanName(['/some/root/pathB', '/some/root/pathA'], CodeAnalysisScope.PROJECT)
            assert.strictEqual(result, getStringHash(`${clientId}::/some/root/pathA,/some/root/pathB::PROJECT`))
        })

        it('should not exceed 126 characters', function () {
            let reallyDeepFilePath = ''
            for (let i = 0; i < 100; i++) {
                reallyDeepFilePath += '/some/deep/path'
            }
            const result = generateScanName(['/some/root/path'], CodeAnalysisScope.FILE_ON_DEMAND, reallyDeepFilePath)
            assert.ok(result.length <= 126)
        })
    })
})
