/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateStateMachineWizard } from '../../../stepFunctions/wizards/createStateMachineWizard'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'

describe('CreateStateMachineWizard', function () {
    let tester: WizardTester<CreateStateMachineWizard>

    beforeEach(async function () {
        tester = await createWizardTester(new CreateStateMachineWizard())
    })

    it('prompts for a file name and format', async function () {
        tester.templateFile.assertShowFirst()
        tester.templateFormat.assertShowSecond()
        tester.assertShowCount(2)
    })
})
