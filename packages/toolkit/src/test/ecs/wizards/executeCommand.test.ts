/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../../../test/shared/wizards/wizardTestUtils'
import { CommandWizard, CommandWizardState } from '../../../ecs/wizards/executeCommand'
import { Container } from '../../../ecs/model'
import { stub } from '../../utilities/stubber'
import { DefaultEcsClient } from '../../../shared/clients/ecsClient'

describe('CreateServiceWizard', function () {
    let tester: WizardTester<CommandWizardState>

    const createContainer = () =>
        new Container(stub(DefaultEcsClient, { regionCode: '' }), '', { clusterArn: '', taskRoleArn: '' })

    beforeEach(async function () {
        tester = await createWizardTester(new CommandWizard(createContainer(), false))
    })

    it('should prompt for tasks and then command', function () {
        tester.task.assertShowFirst()
        tester.command.assertShowSecond()
    })

    it('should ask for confirmation last', async function () {
        tester = await createWizardTester(new CommandWizard(createContainer(), true))
        tester.task.assertShowFirst()
        tester.command.assertShowSecond()
        tester.confirmation.assertShowThird()
    })

    it('should not ask for confirmation if suppressed', function () {
        tester.confirmation.assertDoesNotShow()
    })
})
