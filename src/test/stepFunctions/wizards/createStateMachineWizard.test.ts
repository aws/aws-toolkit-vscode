/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import CreateStateMachineWizard, {
    STARTER_TEMPLATES,
    TemplateFormats,
} from '../../../stepFunctions/wizards/createStateMachineWizard'

describe('CreateStateMachineWizard', async () => {
    it('exits when cancelled', async () => {
        const mockUserPrompt: any = () => Promise.resolve(undefined)
        const wizard = new CreateStateMachineWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.ok(!result)
    })

    it('returns format and template type when completed', async () => {
        const promptRsults = [[STARTER_TEMPLATES[0]], [{ label: TemplateFormats.YAML }]]

        const mockUserPrompt: any = (options: any) => Promise.resolve(promptRsults.shift())
        const wizard = new CreateStateMachineWizard(mockUserPrompt)
        const result = await wizard.run()

        assert.deepStrictEqual(result, { template: STARTER_TEMPLATES[0], templateFormat: TemplateFormats.YAML })
    })
})
