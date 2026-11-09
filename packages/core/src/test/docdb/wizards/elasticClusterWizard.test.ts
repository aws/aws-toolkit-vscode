/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { ElasticClusterConfiguration, ElasticClusterWizard } from '../../../docdb/wizards/elasticClusterWizard'

describe('ElasticClusterWizard', function () {
    let tester: WizardTester<ElasticClusterConfiguration>

    beforeEach(async function () {
        const wizard = new ElasticClusterWizard({} as any, 'title')
        tester = await createWizardTester(wizard)
    })

    it('prompts for properties in the correct order', function () {
        tester.clusterName.assertShow(1)
        tester.adminUserName.assertShow(2)
        tester.adminUserPassword.assertShow(3)
        tester.shardCount.assertShow(4)
        tester.shardInstanceCount.assertShow(5)
        tester.shardCapacity.assertShow(6)
        tester.authType.assertDoesNotShow()
    })
})
