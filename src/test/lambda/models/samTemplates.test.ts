/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    CLI_VERSION_STEP_FUNCTIONS_TEMPLATE,
    getSamCliTemplateParameter,
    getSamTemplateWizardOption,
    getTemplateDescription,
    repromptUserForTemplate,
    SamTemplate,
    helloWorldTemplate,
    eventBridgeHelloWorldTemplate,
    eventBridgeStarterAppTemplate,
    stepFunctionsSampleApp,
} from '../../../lambda/models/samTemplates'
import { Set } from 'immutable'
import { assertThrowsError } from '../../../test/shared/utilities/assertUtils'

import { samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'

const validTemplateOptions: Set<SamTemplate> = Set<SamTemplate>([
    helloWorldTemplate,
    eventBridgeHelloWorldTemplate,
    eventBridgeStarterAppTemplate,
    stepFunctionsSampleApp,
])

const defaultTemplateOptions: Set<SamTemplate> = Set<SamTemplate>([helloWorldTemplate, stepFunctionsSampleApp])

describe('getSamTemplateWizardOption', () => {
    it('should successfully return available templates for specific runtime', () => {
        for (const runtime of samLambdaRuntimes.values()) {
            const result = getSamTemplateWizardOption(runtime, CLI_VERSION_STEP_FUNCTIONS_TEMPLATE)
            switch (runtime) {
                case 'python3.6':
                case 'python3.7':
                case 'python3.8':
                    assert.deepStrictEqual(
                        result,
                        validTemplateOptions,
                        'Event bridge app supports all valid template options'
                    )
                    break
                default:
                    assert.deepStrictEqual(
                        result,
                        defaultTemplateOptions,
                        'Rest of the runtimes support default templates only'
                    )
                    break
            }
        }
    })

    it('should not return Step Functions templates for a SAM CLI version that does not support them', () => {
        for (const runtime of samLambdaRuntimes.values()) {
            const result = getSamTemplateWizardOption(runtime, '0.40.0')
            assert(!result.contains(stepFunctionsSampleApp))
        }
    })
})

describe('getSamCliTemplateParameter', () => {
    it('should successfully return template values used by sam cli', () => {
        for (const template of validTemplateOptions.values()) {
            const result = getSamCliTemplateParameter(template)
            assert.ok(result, `Template name on the wizard : ${template}, sam cli parameter value : ${result}`)
        }
    })

    it('should return error if the template option is not valid', async () => {
        const errorMessage = `${repromptUserForTemplate} is not valid sam template`
        const error = await assertThrowsError(async () => getSamCliTemplateParameter(repromptUserForTemplate))
        assert.strictEqual(error.message, errorMessage, 'Should fail for same error')
    })
})

describe('getTemplateDescription', async () => {
    it('all templates are handled', async () => {
        validTemplateOptions.forEach(template => {
            // Checking that call does not throw
            getTemplateDescription(template)
        })
    })
})
