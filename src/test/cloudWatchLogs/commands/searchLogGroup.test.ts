/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { SearchLogGroupWizard, createFilterpatternPrompter } from '../../../cloudWatchLogs/commands/searchLogGroup'
import { exposeEmitters, ExposeEmitters } from '../../../../src/test/shared/vscode/testUtils'
import { InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'

describe('searchLogGroup', async function () {
    const fakeLogGroups: string[] = []
    let inputBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>
    let testPrompter: InputBoxPrompter
    let testWizard: WizardTester<SearchLogGroupWizard>

    before(function () {
        fakeLogGroups.push('group-1', 'group-2', 'group-3')
        testPrompter = createFilterpatternPrompter()
        inputBox = exposeEmitters(testPrompter.inputBox, ['onDidAccept', 'onDidChangeValue', 'onDidTriggerButton'])
    })

    beforeEach(function () {
        testWizard = createWizardTester(new SearchLogGroupWizard())
    })

    it('shows logGroup prompt first and filterPattern second', function () {
        testWizard.submenuResponse.assertShowFirst()
        testWizard.filterPattern.assertShowSecond()
    })

    it('filterPattern InputBox accepts input', async function () {
        /** Sets the input box's value then fires an accept event */
        // copied from 'src/test/shared/ui/inputPrompter.test.ts'
        function accept(value: string): void {
            inputBox.value = value
            inputBox.fireOnDidAccept()
        }

        const testInput = 'this is my filterPattern'
        const result = testPrompter.prompt()
        accept(testInput)
        assert.strictEqual(await result, testInput)
    })

    it('skips to filterPattern prompt if log group/region given', async function () {
        const nodeTestWizard = createWizardTester(
            new SearchLogGroupWizard({
                groupName: 'group-test',
                regionName: 'region-test',
            })
        )
        nodeTestWizard.filterPattern.assertShowFirst()
        nodeTestWizard.submenuResponse.assertDoesNotShow()
    })
})
