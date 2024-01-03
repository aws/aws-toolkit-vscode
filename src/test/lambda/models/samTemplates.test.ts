/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    cliVersionStepFunctionsTemplate,
    getSamCliTemplateParameter,
    getSamTemplateWizardOption,
    getTemplateDescription,
    repromptUserForTemplate,
    SamTemplate,
    helloWorldTemplate,
    eventBridgeHelloWorldTemplate,
    eventBridgeStarterAppTemplate,
    stepFunctionsSampleApp,
    typeScriptBackendTemplate,
    lazyLoadSamTemplateStrings,
} from '../../../lambda/models/samTemplates'
import { Set } from 'immutable'

import { samZipLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'

let validTemplateOptions: Set<SamTemplate>
let validPythonTemplateOptions: Set<SamTemplate>
let validNodeTemplateOptions: Set<SamTemplate>
let validGoTemplateOptions: Set<SamTemplate>
let defaultTemplateOptions: Set<SamTemplate>

before(function () {
    lazyLoadSamTemplateStrings()

    validTemplateOptions = Set([
        helloWorldTemplate,
        eventBridgeHelloWorldTemplate,
        eventBridgeStarterAppTemplate,
        stepFunctionsSampleApp,
        typeScriptBackendTemplate,
    ])

    validPythonTemplateOptions = Set([
        helloWorldTemplate,
        eventBridgeHelloWorldTemplate,
        eventBridgeStarterAppTemplate,
        stepFunctionsSampleApp,
    ])

    validNodeTemplateOptions = Set([helloWorldTemplate, stepFunctionsSampleApp, typeScriptBackendTemplate])

    validGoTemplateOptions = Set([
        helloWorldTemplate,
        eventBridgeHelloWorldTemplate,
        eventBridgeStarterAppTemplate,
        stepFunctionsSampleApp,
    ])

    defaultTemplateOptions = Set([helloWorldTemplate, stepFunctionsSampleApp])
})

describe('getSamTemplateWizardOption', function () {
    it('should successfully return available templates for specific runtime', function () {
        for (const runtime of samZipLambdaRuntimes.values()) {
            const result = getSamTemplateWizardOption(runtime, 'Zip', cliVersionStepFunctionsTemplate)
            switch (runtime) {
                case 'python3.7':
                case 'python3.8':
                case 'python3.9':
                case 'python3.10':
                case 'python3.11':
                case 'python3.12':
                    assert.deepStrictEqual(
                        result,
                        validPythonTemplateOptions,
                        'Python 3.x supports additional template options'
                    )
                    break
                case 'nodejs16.x':
                    assert.deepStrictEqual(
                        result,
                        validNodeTemplateOptions,
                        'Node supports default and TS template options'
                    )
                    break
                case 'go1.x':
                    assert.deepStrictEqual(
                        result,
                        validGoTemplateOptions,
                        'Go 1.x supports additional template options'
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

    it('should not return Step Functions templates for a SAM CLI version that does not support them', function () {
        for (const runtime of samZipLambdaRuntimes.values()) {
            const result = getSamTemplateWizardOption(runtime, 'Zip', '0.40.0')
            assert(!result.contains(stepFunctionsSampleApp))
        }
    })
})

describe('getSamCliTemplateParameter', function () {
    it('should successfully return template values used by sam cli', function () {
        for (const template of validTemplateOptions.values()) {
            const result = getSamCliTemplateParameter(template)
            assert.ok(result, `Template name on the wizard : ${template}, sam cli parameter value : ${result}`)
        }
    })

    it('should return error if the template option is not valid', async function () {
        assert.throws(
            () => getSamCliTemplateParameter(repromptUserForTemplate),
            new Error(`${repromptUserForTemplate} is not valid sam template`),
            'Should fail for same error'
        )
    })
})

describe('getTemplateDescription', async function () {
    it('all templates are handled', async function () {
        validTemplateOptions.forEach(template => {
            // Checking that call does not throw
            getTemplateDescription(template)
        })
    })
})
