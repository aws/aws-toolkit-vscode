/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createSearchPatternPrompter, SearchLogGroupWizard } from '../../../cloudWatchLogs/commands/searchLogGroup'
import { CloudWatchLogsGroupInfo, CloudWatchLogsParameters } from '../../../cloudWatchLogs/registry/logDataRegistry'
import { TimeFilterSubmenu } from '../../../cloudWatchLogs/timeFilterSubmenu'
import { createQuickPickPrompterTester, QuickPickPrompterTester } from '../../shared/ui/testUtils'
import { getTestWindow } from '../../shared/vscode/window'
import { createWizardTester } from '../../shared/wizards/wizardTestUtils'

describe('searchLogGroup', async function () {
    describe('Wizard', async function () {
        it('shows steps in correct order', function () {
            const testWizard = createWizardTester(new SearchLogGroupWizard())
            testWizard.submenuResponse.assertShowFirst()
            testWizard.timeRange.assertShowSecond()
            testWizard.filterPattern.assertShowThird()
        })

        it('skips steps if parameters are given', async function () {
            const nodeTestWizard = createWizardTester(
                new SearchLogGroupWizard({
                    groupName: 'group-test',
                    regionName: 'region-test',
                })
            )
            nodeTestWizard.timeRange.assertShowFirst()
            nodeTestWizard.filterPattern.assertShowSecond()
            nodeTestWizard.submenuResponse.assertDoesNotShow()
        })

        it('prompts for filterPattern and accepts input', async function () {
            const testInput = 'this is my filterPattern'
            getTestWindow().onDidShowInputBox(input => {
                // assert.strictEqual(input.prompt, '...')
                // assert.strictEqual(input.placeholder, '...')
                input.acceptValue(testInput)
            })
            const logGroup: CloudWatchLogsGroupInfo = {
                groupName: 'est-loggroup',
                regionName: 'us-east-1',
            }
            const logParams: CloudWatchLogsParameters = {}

            const filterPatternPrompter = createSearchPatternPrompter(logGroup, logParams, {}, false, true)
            const result = await filterPatternPrompter.prompt()
            assert.strictEqual(result, testInput)
        })
    })

    describe('TimeFilterSubmenu', async function () {
        let testTimeRangeMenu: TimeFilterSubmenu
        let defaultTimeRangePrompter: QuickPickPrompterTester<any>

        beforeEach(async () => {
            testTimeRangeMenu = new TimeFilterSubmenu()
            defaultTimeRangePrompter = createQuickPickPrompterTester(testTimeRangeMenu.defaultPrompter)
        })

        it('gives option for custom input', async function () {
            defaultTimeRangePrompter.assertContainsItems('Custom time range')
            defaultTimeRangePrompter.acceptItem('Custom time range')
            await defaultTimeRangePrompter.result()
        })

        describe('custom date input', async function () {
            it('accepts valid date (YYYY/MM/DD-YYYY/MM/DD)', async function () {
                const validInput = '2000/10/06-2001/11/08'
                getTestWindow().onDidShowInputBox(input => {
                    input.acceptValue(validInput)
                })
                const customTimeRangePrompter = testTimeRangeMenu.createDateBox()
                const result = customTimeRangePrompter.prompt()
                assert.strictEqual(await result, validInput)
            })

            it('validates date format', function () {
                // Invalid.
                assert(testTimeRangeMenu.validateDate('2000/11/07,2000/12/08')) // No separator
                assert(testTimeRangeMenu.validateDate('2002/13/06-2001/11/05')) // Invalid start date
                assert(testTimeRangeMenu.validateDate('2002/09/06-2001/00/05')) // Invalid end date
                assert(testTimeRangeMenu.validateDate('10/02/2001-08/05/2001')) // Invalid format of dates
                assert(testTimeRangeMenu.validateDate('2000/10/01-2000/10/01')) // Same date
                assert(testTimeRangeMenu.validateDate('2000/10/02-2000/10/01')) // End before start

                // Valid.
                assert(!testTimeRangeMenu.validateDate('2000/10/01-2000/10/03'))
                assert(!testTimeRangeMenu.validateDate('2000/12/01-2001/10/03'))
                assert(!testTimeRangeMenu.validateDate('2022/01/01-2022/05/03'))
                assert(!testTimeRangeMenu.validateDate('2000/12/01-2099/10/03')) // Future date.
            })
        })
    })
})
