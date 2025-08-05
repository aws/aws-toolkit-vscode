/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SecurityIssueProvider } from '../../codewhisperer/service/securityIssueProvider'
import { createCodeScanIssue } from './testUtil'
import { displayFindingsDetectorName } from '../../codewhisperer/models/constants'
import { AggregatedCodeScanIssue } from '../../codewhisperer/models/model'

describe('mergeIssuesDisplayFindings', () => {
    let provider: SecurityIssueProvider
    const testFilePath = '/test/file.py'

    beforeEach(() => {
        provider = Object.create(SecurityIssueProvider.prototype)
        provider.issues = []
    })

    it('should add new issues when no existing group', () => {
        const newIssues: AggregatedCodeScanIssue = {
            filePath: testFilePath,
            issues: [createCodeScanIssue({ findingId: 'new-1' })],
        }

        provider.mergeIssuesDisplayFindings(newIssues, true)

        assert.strictEqual(provider.issues.length, 1)
        assert.strictEqual(provider.issues[0].filePath, testFilePath)
        assert.strictEqual(provider.issues[0].issues.length, 1)
        assert.strictEqual(provider.issues[0].issues[0].findingId, 'new-1')
    })

    it('should keep displayFindings when fromQCA is true', () => {
        provider.issues = [
            {
                filePath: testFilePath,
                issues: [
                    createCodeScanIssue({ findingId: 'qca-1', detectorName: 'QCA-detector' }),
                    createCodeScanIssue({ findingId: 'display-1', detectorName: displayFindingsDetectorName }),
                ],
            },
        ]

        const newIssues: AggregatedCodeScanIssue = {
            filePath: testFilePath,
            issues: [createCodeScanIssue({ findingId: 'new-qca-1', detectorName: 'QCA-detector' })],
        }

        provider.mergeIssuesDisplayFindings(newIssues, true)

        assert.strictEqual(provider.issues.length, 1)
        assert.strictEqual(provider.issues[0].issues.length, 2)

        const findingIds = provider.issues[0].issues.map((issue) => issue.findingId)
        assert.ok(findingIds.includes('display-1'))
        assert.ok(findingIds.includes('new-qca-1'))
        assert.ok(!findingIds.includes('qca-1'))
    })

    it('should keep QCA findings when fromQCA is false', () => {
        provider.issues = [
            {
                filePath: testFilePath,
                issues: [
                    createCodeScanIssue({ findingId: 'qca-1', detectorName: 'QCA-detector' }),
                    createCodeScanIssue({ findingId: 'display-1', detectorName: displayFindingsDetectorName }),
                ],
            },
        ]

        const newIssues: AggregatedCodeScanIssue = {
            filePath: testFilePath,
            issues: [createCodeScanIssue({ findingId: 'new-display-1', detectorName: displayFindingsDetectorName })],
        }

        provider.mergeIssuesDisplayFindings(newIssues, false)

        assert.strictEqual(provider.issues.length, 1)
        assert.strictEqual(provider.issues[0].issues.length, 2)

        const findingIds = provider.issues[0].issues.map((issue) => issue.findingId)
        assert.ok(findingIds.includes('qca-1'))
        assert.ok(findingIds.includes('new-display-1'))
        assert.ok(!findingIds.includes('display-1'))
    })
})
