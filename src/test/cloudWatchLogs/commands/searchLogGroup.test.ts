/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { SearchLogGroupWizard, createSearchPatternPrompter } from '../../../cloudWatchLogs/commands/searchLogGroup'
import { TimeFilterSubmenu } from '../../../cloudWatchLogs/timeFilterSubmenu'
import { exposeEmitters, ExposeEmitters } from '../../../../src/test/shared/vscode/testUtils'
import { InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { createQuickPickTester, QuickPickTester } from '../../shared/ui/testUtils'
import { CloudWatchLogsGroupInfo, CloudWatchLogsParameters } from '../../../cloudWatchLogs/registry/logDataRegistry'

describe('searchLogGroup', async function () {
    describe('Wizard', async function () {
        let testWizard: WizardTester<SearchLogGroupWizard>
        let filterPatternInputBox: ExposeEmitters<
            vscode.InputBox,
            'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'
        >
        let filterPatternPrompter: InputBoxPrompter

        before(function () {
            const logGroup: CloudWatchLogsGroupInfo = {
                groupName: 'est-loggroup',
                regionName: 'us-east-1',
            }
            const logParams: CloudWatchLogsParameters = {}

            filterPatternPrompter = createSearchPatternPrompter(logGroup, logParams, {}, false, true)
            testWizard = createWizardTester(new SearchLogGroupWizard())
            filterPatternInputBox = exposeEmitters(filterPatternPrompter.inputBox, [
                'onDidAccept',
                'onDidChangeValue',
                'onDidTriggerButton',
            ])
        })
        it('shows logGroup prompt first and filterPattern second, then timerange submenu', function () {
            testWizard = createWizardTester(new SearchLogGroupWizard())
            testWizard.submenuResponse.assertShowFirst()
            testWizard.timeRange.assertShowSecond()
            testWizard.filterPattern.assertShowThird()
        })

        it('prompts for filterPattern and accepts input', async function () {
            /** Sets the input box's value then fires an accept event */
            // copied from 'src/test/shared/ui/inputPrompter.test.ts'
            function accept(value: string): void {
                filterPatternInputBox.value = value
                filterPatternInputBox.fireOnDidAccept()
            }
            const testInput = 'this is my filterPattern'
            const result = filterPatternPrompter.prompt()
            accept(testInput)
            assert.strictEqual(await result, testInput)
        })
    })

    describe('TimeFilterSubmenu', async function () {
        let defaultTimeRangePrompter: QuickPickTester<any>
        let testTimeRangeMenu: TimeFilterSubmenu

        before(function () {
            testTimeRangeMenu = new TimeFilterSubmenu()
            defaultTimeRangePrompter = createQuickPickTester(testTimeRangeMenu.defaultPrompter)
        })

        it('gives option for custom input', async function () {
            defaultTimeRangePrompter.assertContainsItems('Custom time range')
            defaultTimeRangePrompter.acceptItem('Custom time range')
            await defaultTimeRangePrompter.result()
        })

        describe('Custom Date Box', async function () {
            let testDateBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>
            let customTimeRangePrompter: InputBoxPrompter

            before(function () {
                customTimeRangePrompter = testTimeRangeMenu.createDateBox()
                testDateBox = exposeEmitters(customTimeRangePrompter.inputBox, [
                    'onDidAccept',
                    'onDidChangeValue',
                    'onDidTriggerButton',
                ])
            })

            it('accepts valid date format of (YYYY/MM/DD-YYYY/MM/DD)', async function () {
                function accept(value: string): void {
                    testDateBox.value = value
                    testDateBox.fireOnDidAccept()
                }

                const validInput = '2000/10/06-2001/11/08'
                const result = customTimeRangePrompter.prompt()
                accept(validInput)
                assert.strictEqual(await result, validInput)
            })

            it("validator won't accept invalid date formats", function () {
                assert(testTimeRangeMenu.validateDate('2000/11/07,2000/12/08')) // No seperator
                assert(testTimeRangeMenu.validateDate('2002/13/06-2001/11/05')) // Invalid start date
                assert(testTimeRangeMenu.validateDate('2002/09/06-2001/00/05')) // Invalid end date
                assert(testTimeRangeMenu.validateDate('10/02/2001-08/05/2001')) // Invalid format of dates
                assert(testTimeRangeMenu.validateDate('2000/10/01-2000/10/01')) // Same date
                assert(testTimeRangeMenu.validateDate('2000/10/02-2000/10/01')) // second date occuring earlier

                // A few valid dates
                assert(!testTimeRangeMenu.validateDate('2000/10/01-2000/10/03'))
                assert(!testTimeRangeMenu.validateDate('2000/12/01-2001/10/03'))
                assert(!testTimeRangeMenu.validateDate('2022/01/01-2022/05/03'))
                assert(!testTimeRangeMenu.validateDate('2000/12/01-2099/10/03')) // second date now can be in the future
            })
        })
    })

    it('skips to filterPattern prompt if log group/region given', async function () {
        const nodeTestWizard = createWizardTester(
            new SearchLogGroupWizard({
                groupName: 'group-test',
                regionName: 'region-test',
            })
        )
        nodeTestWizard.filterPattern.assertShowSecond()
        nodeTestWizard.submenuResponse.assertDoesNotShow()
    })

    it('skips to filterPattern prompt if log group/region given', async function () {
        const nodeTestWizard = createWizardTester(
            new SearchLogGroupWizard({
                groupName: 'group-test',
                regionName: 'region-test',
            })
        )
        nodeTestWizard.timeRange.assertShowFirst()
        nodeTestWizard.submenuResponse.assertDoesNotShow()
    })
})
