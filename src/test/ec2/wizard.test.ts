/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { intoCollection } from '../utilities/collectionUtils'
import { createQuickPickPrompterTester } from '../shared/ui/testUtils'
import { EC2ConnectWizard } from '../../ec2/wizard'
import { WizardTester } from '../shared/wizards/wizardTestUtils'

describe('ec2ConnectWizard', function () {
    let wizard: EC2ConnectWizard
    let tester: WizardTester<EC2ConnectWizard>
    
    it('prompts for instanceId', function () {
        tester.submenuResponse.assertShow()
    })
    

})
