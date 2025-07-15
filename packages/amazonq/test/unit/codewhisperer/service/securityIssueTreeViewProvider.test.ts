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
    CodeIssueGroupingStrategyState,
    CodeIssueGroupingStrategy,
    sasRuleId,
} from 'aws-core-vscode/codewhisperer'
import { createCodeScanIssue } from 'aws-core-vscode/test'
import assert from 'assert'
import sinon from 'sinon'
import path from 'path'

describe('SecurityIssueTreeViewProvider', function () {
    let securityIssueTreeViewProvider: SecurityIssueTreeViewProvider

    beforeEach(function () {
        SecurityIssueProvider.instance.issues = [
            { filePath: 'file/path/a', issues: [createCodeScanIssue(), createCodeScanIssue()] },
            { filePath: 'file/path/b', issues: [createCodeScanIssue(), createCodeScanIssue()] },
            { filePath: 'file/path/c', issues: [createCodeScanIssue(), createCodeScanIssue()] },
            { filePath: 'file/path/d', issues: [createCodeScanIssue(), createCodeScanIssue()] },
        ]
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

        it('should return severity-grouped items when grouping strategy is Severity', function () {
            sinon.stub(CodeIssueGroupingStrategyState.instance, 'getState').returns(CodeIssueGroupingStrategy.Severity)

            const severityItems = securityIssueTreeViewProvider.getChildren() as SeverityItem[]
            for (const [index, [severity, expectedIssueCount]] of [
                ['Critical', 0],
                ['High', 8],
                ['Medium', 0],
                ['Low', 0],
                ['Info', 0],
            ].entries()) {
                const currentSeverityItem = severityItems[index]
                assert.strictEqual(currentSeverityItem.label, severity)
                assert.strictEqual(currentSeverityItem.issues.length, expectedIssueCount)

                const issueItems = securityIssueTreeViewProvider.getChildren(currentSeverityItem) as IssueItem[]
                assert.ok(issueItems.every((item) => item.iconPath === undefined))
                assert.ok(
                    issueItems.every((item) => item.description?.toString().startsWith(path.basename(item.filePath)))
                )
            }
        })

        it('should return file-grouped items when grouping strategy is FileLocation', function () {
            sinon
                .stub(CodeIssueGroupingStrategyState.instance, 'getState')
                .returns(CodeIssueGroupingStrategy.FileLocation)

            const result = securityIssueTreeViewProvider.getChildren() as FileItem[]
            for (const [index, [fileName, expectedIssueCount]] of [
                ['a', 2],
                ['b', 2],
                ['c', 2],
                ['d', 2],
            ].entries()) {
                const currentFileItem = result[index]
                assert.strictEqual(currentFileItem.label, fileName)
                assert.strictEqual(currentFileItem.issues.length, expectedIssueCount)
                assert.strictEqual(currentFileItem.description, 'file/path')

                const issueItems = securityIssueTreeViewProvider.getChildren(currentFileItem) as IssueItem[]
                assert.ok(
                    issueItems.every((item) =>
                        item.iconPath?.toString().includes(`${item.issue.severity.toLowerCase()}.svg`)
                    )
                )
                assert.ok(issueItems.every((item) => !item.description?.toString().startsWith('[Ln ')))
            }
        })
    })
})

describe('IssueItem', function () {
    it('has issueWithFix context value for issues with suggested fix', function () {
        const issueItem = new IssueItem(
            'file/path',
            createCodeScanIssue({ suggestedFixes: [{ code: 'fixCode', description: 'fixDescription' }] })
        )
        assert.strictEqual(issueItem.contextValue, 'issueWithFix')
    })

    it('has issueWithoutFix context value for issues without suggested fix', function () {
        const issueItem = new IssueItem('file/path', createCodeScanIssue({ suggestedFixes: [] }))
        assert.strictEqual(issueItem.contextValue, 'issueWithoutFix')
    })

    it('has issueWithFixDisabled context value for SAS findings', function () {
        const issueItem = new IssueItem('file/path', createCodeScanIssue({ ruleId: sasRuleId }))
        assert.strictEqual(issueItem.contextValue, 'issueWithFixDisabled')
    })
})
