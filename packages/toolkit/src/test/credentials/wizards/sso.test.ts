/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../../../test/shared/wizards/wizardTestUtils'
import { SsoWizard, SsoWizardState } from '../../../auth/wizards/sso'

describe('SSO Wizard', function () {
    let tester: WizardTester<SsoWizardState>

    beforeEach(async function () {
        tester = await createWizardTester(new SsoWizard())
    })

    it('prompts for region, start URL, account ID, and role name', function () {
        tester.region.assertShow(1)
        tester.startUrl.assertShow(2)

        // "hidden" step in the flow that validates the token
        tester.tokenProvider.assertShow(3)

        tester.accountId.assertShow(4)
        tester.roleName.assertShow(5)
    })
})
