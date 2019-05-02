/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import {
    DefaultSamCliVersionValidator,
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
    validateSamCliVersion
} from '../../../../shared/sam/cli/samCliVersionValidator'

const samCliVersionTestScenarios = [
    {
        situation: 'SAM CLI Version is valid',
        version: MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
        expectedVersionValidation: SamCliVersionValidation.Valid,
    },
    {
        situation: 'SAM CLI Version is too low',
        version: '0.0.1',
        expectedVersionValidation: SamCliVersionValidation.VersionTooLow,
    },
    {
        situation: 'SAM CLI Version is too high',
        version: '999999.9999.999999',
        expectedVersionValidation: SamCliVersionValidation.VersionTooHigh,
    },
    {
        situation: 'SAM CLI Version is undefined',
        version: undefined,
        expectedVersionValidation: SamCliVersionValidation.VersionNotParseable,
    },
    {
        situation: 'SAM CLI Version is unparsable - random text',
        version: 'what.in.tarnation',
        expectedVersionValidation: SamCliVersionValidation.VersionNotParseable,
    },
]

describe('SamCliVersionValidator', async () => {

    const validator = new DefaultSamCliVersionValidator()

    samCliVersionTestScenarios.forEach(test => {
        it(`validates when ${test.situation}`, async () => {
            const validationResult: SamCliVersionValidatorResult =
                await validator.getCliValidationStatus(test.version)

            assert.strictEqual(validationResult.version, test.version, 'Unexpected version')
            assert.strictEqual(
                validationResult.validation,
                test.expectedVersionValidation,
                'Unexpected version validation'
            )
        })
    })
})

describe('validateSamCliVersion', async () => {
    samCliVersionTestScenarios.forEach(test => {
        it(`validates when ${test.situation}`, async () => {
            const validation: SamCliVersionValidation = validateSamCliVersion(test.version)

            assert.strictEqual(validation, test.expectedVersionValidation, 'Unexpected version validation')
        })
    })
})
