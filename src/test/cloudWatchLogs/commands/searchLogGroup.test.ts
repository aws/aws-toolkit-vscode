/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import {
    SearchLogGroupWizard,
    createFilterpatternPrompter,
    TimeFilterSubmenu,
} from '../../../cloudWatchLogs/commands/searchLogGroup'
import { exposeEmitters, ExposeEmitters } from '../../../../src/test/shared/vscode/testUtils'
import { InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { createQuickPickTester, QuickPickTester } from '../../shared/ui/testUtils'

describe('searchLogGroup', async function () {
    const fakeLogGroups: string[] = []
    let inputBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>
    let testPrompter: InputBoxPrompter
    let testWizard: WizardTester<SearchLogGroupWizard>
    let testTimeRangeMenu: TimeFilterSubmenu
    let testSubmenu: QuickPickTester<any>
    let dateBoxPrompter: InputBoxPrompter
    let testDateBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>

    before(function () {
        fakeLogGroups.push('group-1', 'group-2', 'group-3')
        testPrompter = createFilterpatternPrompter()
        testTimeRangeMenu = new TimeFilterSubmenu()
        dateBoxPrompter = testTimeRangeMenu.createDateBox()

        inputBox = exposeEmitters(testPrompter.inputBox, ['onDidAccept', 'onDidChangeValue', 'onDidTriggerButton'])
        testDateBox = exposeEmitters(dateBoxPrompter.inputBox, [
            'onDidAccept',
            'onDidChangeValue',
            'onDidTriggerButton',
        ])
        testSubmenu = createQuickPickTester(testTimeRangeMenu.createMenuPrompter())
    })

    beforeEach(function () {
        testWizard = createWizardTester(new SearchLogGroupWizard())
    })

    it('shows logGroup prompt first and filterPattern second, then timerange submenu', function () {
        testWizard.submenuResponse.assertShowFirst()
        testWizard.filterPattern.assertShowSecond()
        testWizard.timeRange.assertShowThird()
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

    it('Timerange Submenu gives option for custom input', async function () {
        testSubmenu.assertContainsItems('Custom time range')
        testSubmenu.acceptItem('Custom time range')
        await testSubmenu.result()
    })

    it('Datebox accepts valid date format of (YYYY/MM/DD-YYYY/MM/DD)', async function () {
        function accept(value: string): void {
            testDateBox.value = value
            testDateBox.fireOnDidAccept()
        }

        const validInput = '2000/10/06-2001/11/08'
        const result = dateBoxPrompter.prompt()
        accept(validInput)
        assert.strictEqual(await result, validInput)
    })

    it("Datebox validator won't accept invalid date formats", function () {
        assert(testTimeRangeMenu.validateDate('2000/11/07,2000/12/08')) // No seperator
        assert(testTimeRangeMenu.validateDate('2002/13/06-2001/11/05')) // Invalid start date
        assert(testTimeRangeMenu.validateDate('2002/09/06-2001/00/05')) // Invalid end date
        assert(testTimeRangeMenu.validateDate('10/02/2001-08/05/2001')) // Invalid format of dates
        assert(testTimeRangeMenu.validateDate('2000/10/01-2000/10/01')) // Same date
        assert(testTimeRangeMenu.validateDate('2000/10/02-2000/10/01')) // second date occuring earlier
        assert(testTimeRangeMenu.validateDate('2000/12/01-2099/10/03')) // second date can't be in the future

        // A few valid dates
        assert(!testTimeRangeMenu.validateDate('2000/10/01-2000/10/03'))
        assert(!testTimeRangeMenu.validateDate('2000/12/01-2001/10/03'))
        assert(!testTimeRangeMenu.validateDate('2022/01/01-2022/05/03'))
    })
})
