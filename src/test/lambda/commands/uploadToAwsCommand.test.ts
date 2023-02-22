/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { UploadToAwsWizard, UploadToAwsWizardState } from '../../../lambda/commands/uploadToAwsCommand'

describe('UploadToAwsWizard', function () {
    let tester: WizardTester<UploadToAwsWizardState>

    beforeEach(function () {
        tester = createWizardTester(new UploadToAwsWizard())
    })

    it('shows region prompt when S3 is selected', function () {
        tester.resource.applyInput('s3')
        tester.region.assertShow()
    })

    it('skips region prompt when Lambda is selected', function () {
        tester.resource.applyInput('lambda')
        tester.region.assertDoesNotShow()
    })
})
