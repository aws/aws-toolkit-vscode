/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { RegionalClusterConfiguration, RegionalClusterWizard } from '../../../docdb/wizards/regionalClusterWizard'

describe('RegionalClusterWizard', function () {
    let tester: WizardTester<RegionalClusterConfiguration>

    beforeEach(async function () {
        const wizard = new RegionalClusterWizard({} as any, 'title')
        tester = await createWizardTester(wizard)
    })

    it('prompts for properties in the correct order', function () {
        tester.DBClusterIdentifier.assertShow(1)
        tester.Engine.assertDoesNotShow()
        tester.EngineVersion.assertShow(2)
        tester.MasterUsername.assertShow(3)
        tester.MasterUserPassword.assertShow(4)
        tester.StorageEncrypted.assertShow(5)
        tester.DBInstanceCount.assertShow(6)
        tester.DBInstanceClass.assertShow(7)
    })
})
