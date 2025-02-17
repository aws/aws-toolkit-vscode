/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { CreateGlobalClusterState, CreateGlobalClusterWizard } from '../../../docdb/wizards/createGlobalClusterWizard'

describe('CreateGlobalClusterWizard', function () {
    let tester: WizardTester<CreateGlobalClusterState>

    beforeEach(async function () {
        const engineVersion = '5.0.0'
        const wizard = new CreateGlobalClusterWizard('region', engineVersion, {} as any)
        tester = await createWizardTester(wizard)
    })

    it('prompts for secondary region and global cluster name', function () {
        tester.RegionCode.assertShowFirst()
        tester.GlobalClusterName.assertShowSecond()
        tester.Cluster.assertShowAny()
    })
})
