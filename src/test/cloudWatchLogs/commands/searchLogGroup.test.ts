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
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { createQuickPickTester } from '../../shared/ui/testUtils'
import { exposeEmitters, ExposeEmitters } from '../../../../src/test/shared/vscode/testUtils'
import { InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createWizardTester } from '../../shared/wizards/wizardTestUtils'

class FakeNode extends AWSTreeNodeBase {
    public constructor(label: string) {
        super(label)
    }
}

describe('searchLogGroup', async function () {
    let fakeLogNodes: AWSTreeNodeBase[] = []
    let inputBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>
    let testPrompter: InputBoxPrompter

    before(function () {
        fakeLogNodes.push(new FakeNode('group-1'), new FakeNode('group-2'), new FakeNode('group-3'))
        testPrompter = createFilterpatternPrompter()

        inputBox = exposeEmitters(testPrompter.inputBox, ['onDidAccept', 'onDidChangeValue', 'onDidTriggerButton'])
    })

    it('Wizard accepts inputs', async function () {
        const testWizard = createWizardTester(new SearchLogGroupWizard(fakeLogNodes))
        const logGroupSelection = 'group-2'
        testWizard.logGroup.applyInput(logGroupSelection)
        testWizard.logGroup.assertValue(logGroupSelection)

        const filterPatternSelection = 'this is filter text'
        testWizard.filterPattern.applyInput(filterPatternSelection)
        testWizard.filterPattern.assertValue(filterPatternSelection)
    })

    it('creates Log Group prompter from TreeNodes', async function () {
        const prompter = createLogGroupPrompter(fakeLogNodes)
        const tester = createQuickPickTester(prompter)
        tester.assertItems(['group-1', 'group-2', 'group-3'])
        const selection = 'group-2'
        tester.acceptItem(selection)
        tester.result(selection)
    })

    it('creates an valid InputBox', async function () {
        assert.strictEqual(inputBox.title, 'Keyword Search')
        assert.strictEqual(inputBox.placeholder, 'Enter text here')
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
