/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createQuickPickPrompterTester, QuickPickPrompterTester } from 'aws-core-vscode/test'
import {
    CodeIssueGroupingStrategy,
    CodeIssueGroupingStrategyState,
    createCodeIssueGroupingStrategyPrompter,
} from 'aws-core-vscode/codewhisperer'
import sinon from 'sinon'
import assert from 'assert'
import vscode from 'vscode'

const severity = { data: CodeIssueGroupingStrategy.Severity, label: 'Severity' }
const fileLocation = { data: CodeIssueGroupingStrategy.FileLocation, label: 'File Location' }

describe('createCodeIssueGroupingStrategyPrompter', function () {
    let tester: QuickPickPrompterTester<CodeIssueGroupingStrategy>

    beforeEach(function () {
        tester = createQuickPickPrompterTester(createCodeIssueGroupingStrategyPrompter())
    })

    afterEach(function () {
        sinon.restore()
    })

    it('should list grouping strategies', async function () {
        tester.assertItems([severity, fileLocation])
        tester.hide()
        await tester.result()
    })

    it('should update state on selection', async function () {
        const originalState = CodeIssueGroupingStrategyState.instance.getState()
        assert.equal(originalState, CodeIssueGroupingStrategy.Severity)

        tester.selectItems(fileLocation)
        tester.addCallback(() => vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem'))

        await tester.result()
        assert.equal(CodeIssueGroupingStrategyState.instance.getState(), fileLocation.data)
    })
})
