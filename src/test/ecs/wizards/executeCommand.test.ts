/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { createWizardTester, WizardTester } from '../../../test/shared/wizards/wizardTestUtils'
import { instance, mock } from '../../utilities/mockito'
import { CommandWizard, CommandWizardState } from '../../../ecs/wizards/executeCommand'

describe('CreateServiceWizard', function () {
    let tester: WizardTester<CommandWizardState>
    const node = mock()

    beforeEach(function () {
        tester = createWizardTester(new CommandWizard(instance(node), false))
    })

    it('should prompt for tasks and then command', function () {
        tester.task.assertShowFirst()
        tester.command.assertShowSecond()
    })

    it('should ask for confirmation last', function () {
        tester = createWizardTester(new CommandWizard(instance(node), true))
        tester.task.assertShowFirst()
        tester.command.assertShowSecond()
        tester.confirmation.assertShowThird()
    })

    it('should not ask for confirmation if suppressed', function () {
        tester.confirmation.assertDoesNotShow()
    })
})
