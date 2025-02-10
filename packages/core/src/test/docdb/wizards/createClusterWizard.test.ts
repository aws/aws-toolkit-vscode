/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { CreateClusterState, CreateClusterWizard } from '../../../docdb/wizards/createClusterWizard'

describe('CreateClusterWizard', function () {
    let tester: WizardTester<CreateClusterState>

    beforeEach(async function () {
        const wizard = new CreateClusterWizard({} as any)
        tester = await createWizardTester(wizard)
    })

    it('prompts for cluster type first', function () {
        tester.ClusterType.assertShowFirst()
    })

    it('prompts for regional cluster when selected', function () {
        tester.ClusterType.applyInput('regional')
        tester.RegionalCluster.assertShowAny()
        tester.ElasticCluster.assertDoesNotShowAny()
    })

    it('prompts for elastic cluster when selected', function () {
        tester.ClusterType.applyInput('elastic')
        tester.RegionalCluster.assertDoesNotShowAny()
        tester.ElasticCluster.assertShowAny()
    })
})
