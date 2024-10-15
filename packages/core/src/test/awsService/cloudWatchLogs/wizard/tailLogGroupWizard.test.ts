/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TailLogGroupWizard } from '../../../../awsService/cloudWatchLogs/wizard/tailLogGroupWizard'
import { createWizardTester } from '../../../shared/wizards/wizardTestUtils'

describe('TailLogGroupWizard', async function () {
    it('prompts regionLogGroup submenu first if context not provided', async function () {
        const wizard = new TailLogGroupWizard()
        const tester = await createWizardTester(wizard)
        tester.regionLogGroupSubmenuResponse.assertShowFirst()
        tester.logStreamFilter.assertShowSecond()
        tester.filterPattern.assertShowThird()
    })

    it('skips regionLogGroup submenu if context provided', async function () {
        const wizard = new TailLogGroupWizard({
            groupName: 'test-groupName',
            regionName: 'test-regionName',
        })
        const tester = await createWizardTester(wizard)
        tester.regionLogGroupSubmenuResponse.assertDoesNotShow()
        tester.logStreamFilter.assertShowFirst()
        tester.filterPattern.assertShowSecond()
    })
})
