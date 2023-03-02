/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createWizardTester, WizardTester } from './wizards/wizardTestUtils'
import { UploadToAwsWizard, UploadToAwsWizardState } from '../../shared/uploadToAwsCommand'

describe('UploadToAwsWizard', function () {
    let tester: WizardTester<UploadToAwsWizardState>

    beforeEach(function () {
        tester = createWizardTester(new UploadToAwsWizard())
    })

    it('prompts for upload destination', function () {
        tester.resource.assertShow()
    })
})
