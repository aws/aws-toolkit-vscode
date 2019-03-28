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
    SamCliVersionValidatorResult
} from '../../../../shared/sam/cli/samCliVersionValidator'

const validator = new DefaultSamCliVersionValidator()

describe('SamCliVersionValidator', async () => {

    it('validates', async () => {
        const validationResult: SamCliVersionValidatorResult =
            await validator.getCliValidationStatus(MINIMUM_SAM_CLI_VERSION_INCLUSIVE)

        assert.strictEqual(validationResult.version, MINIMUM_SAM_CLI_VERSION_INCLUSIVE)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.Valid)
    })

    it('rejects undefined version', async () => {
        const validationResult: SamCliVersionValidatorResult = await validator.getCliValidationStatus(undefined)

        assert.strictEqual(validationResult.version, undefined)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionNotParseable)
    })

    it('rejects out-of-date versions', async () => {
        const testLowLevel = '0.0.1'

        const validationResult: SamCliVersionValidatorResult = await validator.getCliValidationStatus(testLowLevel)

        assert.strictEqual(validationResult.version, testLowLevel)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionTooLow)
    })

    it('rejects versions that are too new', async () => {
        const testHighLevel = '999999.9999.999999'

        const validationResult: SamCliVersionValidatorResult = await validator.getCliValidationStatus(testHighLevel)

        assert.strictEqual(validationResult.version, testHighLevel)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionTooHigh)
    })

    it('rejects versions that are not valid semver versions', async () => {
        const testWrongLevel = 'what.in.tarnation'

        const validationResult: SamCliVersionValidatorResult = await validator.getCliValidationStatus(testWrongLevel)

        assert.strictEqual(validationResult.version, testWrongLevel)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionNotParseable)
    })

    it('rejects undefined versions', async () => {

        const validationResult: SamCliVersionValidatorResult = await validator.getCliValidationStatus()

        assert.strictEqual(validationResult.version, undefined)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionNotParseable)
    })
})
