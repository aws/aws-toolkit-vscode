/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import {
    SearchLogGroupWizard,
    createLogGroupPrompter,
    createFilterpatternPrompter,
} from '../../../cloudWatchLogs/commands/searchLogGroup'
import { createQuickPickTester } from '../../shared/ui/testUtils'
import { exposeEmitters, ExposeEmitters } from '../../../../src/test/shared/vscode/testUtils'
import { InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'

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
        testWizard = createWizardTester(new SearchLogGroupWizard(fakeLogGroups))
    })

    it('shows logGroup prompt first', function () {
        testWizard.logGroup.assertShow()
        testWizard.logGroup.applyInput('group-1')
    })

    it('Shoes filterPattern prompt when logGroup is chosen', function () {
        testWizard.logGroup.applyInput('group-2')
        testWizard.filterPattern.assertShow()
    })

    it('creates Log Group prompter from TreeNodes', async function () {
        const prompter = createLogGroupPrompter(fakeLogGroups)
        const tester = createQuickPickTester(prompter)
        tester.assertItems(['group-1', 'group-2', 'group-3'])
        const selection = 'group-2'
        tester.acceptItem(selection)
        await tester.result(selection)
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
})
