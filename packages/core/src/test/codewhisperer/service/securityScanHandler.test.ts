/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromiseResult } from 'aws-sdk/lib/request'
import { DefaultCodeWhispererClient, ListCodeScanFindingsResponse } from '../../../codewhisperer/client/codewhisperer'
import { listScanResults } from '../../../codewhisperer/service/securityScanHandler'
import { Stub, stub } from '../../utilities/stubber'
import { AWSError, HttpResponse } from 'aws-sdk'
import { RawCodeScanIssue } from '../../../codewhisperer/models/model'
import { CodeAnalysisScope } from '../../../codewhisperer/models/constants'
import assert from 'assert'
import sinon from 'sinon'
import fs from 'fs'

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
                CodeAnalysisScope.PROJECT
            )

            assert.equal(aggregatedCodeScanIssueList.length, 2)
            assert.equal(
                aggregatedCodeScanIssueList[0].filePath,
                'projectPath/python3.7-plain-sam-app/hello_world/app.py'
            )
            assert.equal(aggregatedCodeScanIssueList[0].issues.length, 1)
            assert.equal(
                aggregatedCodeScanIssueList[1].filePath,
                '/workspaceFolder/python3.7-plain-sam-app/hello_world/app.py'
            )
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
                CodeAnalysisScope.PROJECT
            )

            assert.equal(aggregatedCodeScanIssueList.length, 2)
            assert.equal(aggregatedCodeScanIssueList[0].issues.length, 3)
        })
    })
})
