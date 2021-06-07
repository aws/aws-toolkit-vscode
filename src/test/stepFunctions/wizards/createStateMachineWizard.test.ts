/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { MockPrompter } from '../../shared/wizards/wizardFramework'
import CreateStateMachineWizard, {
    CreateStateMachineWizardPrompters,
    STARTER_TEMPLATES,
    TemplateFormats,
} from '../../../stepFunctions/wizards/createStateMachineWizard'

describe('CreateStateMachineWizard', async function () {
    it('exits when cancelled', async function () {
        const mockPrompters: CreateStateMachineWizardPrompters = {
            templateFile: () => new MockPrompter<string>(undefined),
            templateFormat: () => new MockPrompter<TemplateFormats>(undefined),
        }
        const wizard = new CreateStateMachineWizard(mockPrompters)
        const result = await wizard.run()

        assert.ok(!result)
    })

    it('returns format and template type when completed', async function () {
        const mockPrompters: CreateStateMachineWizardPrompters = {
            templateFile: () => new MockPrompter<string>(STARTER_TEMPLATES[0].data as string),
            templateFormat: () => new MockPrompter<TemplateFormats>(TemplateFormats.YAML),
        }
        const wizard = new CreateStateMachineWizard(mockPrompters)
        const result = await wizard.run()

        assert.deepStrictEqual(result, { templateFile: STARTER_TEMPLATES[0].data, templateFormat: TemplateFormats.YAML })
    })
})
