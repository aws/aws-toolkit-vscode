/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    PublishStateMachineAction,
    PublishStateMachineWizard,
} from '../../../stepFunctions/wizards/publishStateMachineWizard'
import { WizardTester, createWizardTester } from '../../shared/wizards/wizardTestUtils'

describe('PublishStateMachineWizard', async function () {
    let tester: WizardTester<PublishStateMachineWizard>

    beforeEach(function () {
        tester = createWizardTester(new PublishStateMachineWizard())
    })

    it('only shows two steps until an action is selected', function () {
        tester.assertShowCount(2)
    })

    it('always prompts for region and action', function () {
        tester.region.assertShowFirst()
        tester.publishAction.assertShowSecond()
    })

    it('prompts for state machine arn if updating an existing state machine', function () {
        tester.region.applyInput('us-east-1')
        tester.publishAction.applyInput(PublishStateMachineAction.QuickUpdate)
        tester.createResponse.assertDoesNotShowAny()
        tester.updateResponse.stateMachineArn.assertShow()
    })

    it('prompts for name and role arn if creating a new state machine', function () {
        tester.region.applyInput('us-east-1')
        tester.publishAction.applyInput(PublishStateMachineAction.QuickCreate)
        tester.updateResponse.assertDoesNotShowAny()
        tester.createResponse.name.assertShow()
        tester.createResponse.roleArn.assertShow()
    })
})
