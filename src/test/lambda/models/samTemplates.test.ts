/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    exitWizard,
    getApiValueForSchemasDownload,
    getSamCliTemplateParameter,
    getSamTemplateWizardOption,
    helloWorldOption,
    validTemplateOptions
} from '../../../lambda/models/samTemplates'
import { assertThrowsError } from '../../../test/shared/utilities/assertUtils'

import { samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'

describe('getSamTemplateWizardOption', () => {
    it('should successfully return available templates for specific runtime', () => {
        for (const runtime of samLambdaRuntimes.values()) {
            const result = getSamTemplateWizardOption(runtime)
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
                        helloWorldOption,
                        'Rest of the runtimes support hello-world template only'
                    )
                    break
            }
        }
    })
})

describe('getSamCliTemplateParameter', () => {
    it('should successfully return template values used by sam cli', () => {
        for (const template of validTemplateOptions.values()) {
            const result = getSamCliTemplateParameter(template)
            assert.ok(result, `Template description on the wizard : ${template}, sam cli parameter value : ${result}`)
        }
    })

    it('should return error if the template option is not valid', async () => {
        const erroMessage = `Template ${exitWizard} is not supported for sam application flow`
        const error = await assertThrowsError(async () => getSamCliTemplateParameter(exitWizard))
        assert.strictEqual(error.message, erroMessage, 'Should fail for same error')
    })
})

describe('getApiValueForSchemasDownload', () => {
    it('should return api value for runtimes supported by eventBridge application', async () => {
        for (const runtime of samLambdaRuntimes.values()) {
            switch (runtime) {
                case 'python3.6':
                case 'python3.7':
                case 'python3.8':
                    const result = getApiValueForSchemasDownload(runtime)
                    assert.strictEqual(result, 'Python36', 'Api value used by schemas api')
                    break
                default:
                    const erroMessage = `Runtime ${runtime} is not supported by eventBridge application`
                    const error = await assertThrowsError(async () => getApiValueForSchemasDownload(runtime))
                    assert.strictEqual(error.message, erroMessage, 'Should fail for same error')
                    break
            }
        }
    })
})
