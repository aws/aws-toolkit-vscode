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
} from 'aws-core-vscode/codewhisperer'
import { timeoutUtils } from 'aws-core-vscode/shared'
import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
// import fs from 'fs' // eslint-disable-line no-restricted-imports
import path from 'path'

const buildRawCodeScanIssue = (fromProject: boolean = true, params?: Partial<RawCodeScanIssue>): RawCodeScanIssue => ({
    filePath: fromProject
        ? 'workspaceFolder/python3.7-plain-sam-app/hello_world/app.py'
        : path.join(getWorkspaceFolder().substring(1), '/python3.7-plain-sam-app/hello_world/app.py'),
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

function getWorkspaceFolder(): string {
    return path.join(__dirname, '../../../../../../core/dist/src/testFixtures/workspaceFolder')
}

describe('securityScanHandler', function () {
    describe('listScanResults', function () {
        let mockClient: Stub<DefaultCodeWhispererClient>
        beforeEach(function () {
            mockClient = stub(DefaultCodeWhispererClient)
        })

        it('should make ListCodeScanFindings request and aggregate findings by file path', async function () {
            mockClient.listCodeScanFindings.resolves(buildMockListCodeScanFindingsResponse())

            const aggregatedCodeScanIssueList = await listScanResults(
                mockClient,
                'jobId',
                'codeScanFindingsSchema',
                [getWorkspaceFolder()],
                CodeAnalysisScope.PROJECT,
                undefined
            )

            assert.equal(aggregatedCodeScanIssueList.length, 1)
            assert.equal(aggregatedCodeScanIssueList[0].issues.length, 1)
        })

        it('should handle ListCodeScanFindings request with paginated response', async function () {
            mockClient.listCodeScanFindings
                .onFirstCall()
                .resolves(
                    buildMockListCodeScanFindingsResponse(
                        JSON.stringify([buildRawCodeScanIssue(true, { title: 'title1' })]),
                        true
                    )
                )
                .onSecondCall()
                .resolves(
                    buildMockListCodeScanFindingsResponse(
                        JSON.stringify([buildRawCodeScanIssue(true, { title: 'title2' })]),
                        true
                    )
                )
                .onThirdCall()
                .resolves(
                    buildMockListCodeScanFindingsResponse(
                        JSON.stringify([buildRawCodeScanIssue(true, { title: 'title3' })]),
                        false
                    )
                )

            const aggregatedCodeScanIssueList = await listScanResults(
                mockClient,
                'jobId',
                'codeScanFindingsSchema',
                [getWorkspaceFolder()],
                CodeAnalysisScope.PROJECT,
                undefined
            )

            assert.equal(aggregatedCodeScanIssueList.length, 1)
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
                    [getWorkspaceFolder()],
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
        it('should include ListCodeScanFindings from opened file that is not from project', async function () {
            mockClient.listCodeScanFindings.resolves(
                buildMockListCodeScanFindingsResponse(JSON.stringify([buildRawCodeScanIssue(false)]))
            )

            const aggregatedCodeScanIssueList = await listScanResults(
                mockClient,
                'jobId',
                'codeScanFindingsSchema',
                [],
                CodeAnalysisScope.PROJECT,
                undefined
            )
            assert.equal(aggregatedCodeScanIssueList.length, 1)
            assert.equal(aggregatedCodeScanIssueList[0].issues.length, 1)
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
})
