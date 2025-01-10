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

const severity = { label: 'Severity', data: CodeIssueGroupingStrategy.Severity }
const fileLocation = { label: 'File Location', data: CodeIssueGroupingStrategy.FileLocation }

describe('createCodeIssueGroupingStrategyPrompter', function () {
    let tester: QuickPickPrompterTester<CodeIssueGroupingStrategy>

    beforeEach(function () {
        tester = createQuickPickPrompterTester(createCodeIssueGroupingStrategyPrompter())
    })

    it('should list grouping strategies', function () {
        tester.assertItems([severity, fileLocation])
    })

    it('should update state on selection', async function () {
        const spy = sinon.spy(CodeIssueGroupingStrategyState.instance, 'setState')

        tester.selectItems(fileLocation)
        tester.assertSelectedItems(fileLocation)

        spy.calledWith(CodeIssueGroupingStrategy.FileLocation)
    })
})
