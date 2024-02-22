/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import {
    PublishSSMDocumentWizard,
    PublishSSMDocumentWizardResponse,
} from '../../../ssmDocument/wizards/publishDocumentWizard'

describe('AppRunnerCodeRepositoryWizard', function () {
    let tester: WizardTester<PublishSSMDocumentWizardResponse>

    beforeEach(async function () {
        const wizard = new PublishSSMDocumentWizard()
        tester = await createWizardTester(wizard)
    })

    it('has 3 steps by default', function () {
        tester.assertShowCount(3)
    })

    it('never prompts for document type and uses a default value instead', function () {
        tester.documentType.assertDoesNotShow()
        tester.documentType.assertValue('Automation')
    })

    it('prompts for region, action, and a document name', function () {
        tester.region.assertShowFirst()
        tester.action.assertShowSecond()
        tester.name.assertShowThird()
    })

    it('skips the region prompt if provided a region', async function () {
        const wizard = new PublishSSMDocumentWizard('us-west-2')
        tester = await createWizardTester(wizard)
        tester.region.assertDoesNotShow()
        tester.assertShowCount(2)
    })
})
