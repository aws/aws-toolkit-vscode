/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    FileItem,
    IssueItem,
    SecurityIssueTreeViewProvider,
    SecurityTreeViewFilterState,
    SecurityIssueProvider,
    SeverityItem,
} from 'aws-core-vscode/codewhisperer'
import { createCodeScanIssue } from 'aws-core-vscode/test'
import assert from 'assert'
import sinon from 'sinon'

describe('SecurityIssueTreeViewProvider', function () {
    let securityIssueProvider: SecurityIssueProvider
    let securityIssueTreeViewProvider: SecurityIssueTreeViewProvider

    beforeEach(function () {
        securityIssueProvider = SecurityIssueProvider.instance
        securityIssueTreeViewProvider = new SecurityIssueTreeViewProvider()
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('getTreeItem', function () {
        it('should return the element as a FileItem', function () {
            const element = new FileItem('dummy-path', [])
            const result = securityIssueTreeViewProvider.getTreeItem(element)
            assert.strictEqual(result, element)
        })

        it('should return the element as a IssueItem', function () {
            const element = new IssueItem('dummy-path', createCodeScanIssue())
            const result = securityIssueTreeViewProvider.getTreeItem(element)
            assert.strictEqual(result, element)
        })
    })

    describe('getChildren', function () {
        it('should return sorted list of severities if element is undefined', function () {
            securityIssueProvider.issues = [
                { filePath: 'file/path/c', issues: [createCodeScanIssue(), createCodeScanIssue()] },
                { filePath: 'file/path/d', issues: [createCodeScanIssue(), createCodeScanIssue()] },
                { filePath: 'file/path/a', issues: [createCodeScanIssue(), createCodeScanIssue()] },
                { filePath: 'file/path/b', issues: [createCodeScanIssue(), createCodeScanIssue()] },
            ]

            const element = undefined
            const result = securityIssueTreeViewProvider.getChildren(element) as SeverityItem[]
            assert.strictEqual(result.length, 5)
            assert.strictEqual(result[0].label, 'Critical')
            assert.strictEqual(result[0].description, '0 issues')
            assert.strictEqual(result[1].label, 'High')
            assert.strictEqual(result[1].description, '8 issues')
            assert.strictEqual(result[2].label, 'Medium')
            assert.strictEqual(result[2].description, '0 issues')
            assert.strictEqual(result[3].label, 'Low')
            assert.strictEqual(result[3].description, '0 issues')
            assert.strictEqual(result[4].label, 'Info')
            assert.strictEqual(result[4].description, '0 issues')
        })

        it('should return sorted list of issues if element is SeverityItem', function () {
            const element = new SeverityItem('Critical', [
                {
                    ...createCodeScanIssue({ title: 'Finding A', startLine: 10, severity: 'Critical' }),
                    filePath: 'file/path/a',
                },
                {
                    ...createCodeScanIssue({ title: 'Finding B', startLine: 2, severity: 'Critical' }),
                    filePath: 'file/path/b',
                },
            ])
            const result = securityIssueTreeViewProvider.getChildren(element) as IssueItem[]
            assert.strictEqual(result.length, 2)
            assert.strictEqual(result[0].label, 'Finding A')
            assert.strictEqual(result[1].label, 'Finding B')
        })

        it('should filter out severities', function () {
            const element = undefined
            let result = securityIssueTreeViewProvider.getChildren(element) as SeverityItem[]
            assert.strictEqual(result.length, 5)

            sinon.stub(SecurityTreeViewFilterState.instance, 'getHiddenSeverities').returns(['Medium'])

            result = securityIssueTreeViewProvider.getChildren(element) as SeverityItem[]
            assert.strictEqual(result.length, 4)
            assert.ok(result.every((item) => item.severity !== 'Medium'))
        })

        it('should not show issues that are not visible', function () {
            const element = new SeverityItem('Critical', [
                { ...createCodeScanIssue({ visible: false }), filePath: 'file/path/a' },
            ])
            const result = securityIssueTreeViewProvider.getChildren(element) as IssueItem[]
            assert.strictEqual(result.length, 0)
        })
    })
})
