/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { SamCliVersion, SamCliVersionValidation } from '../../../../shared/sam/cli/samCliVersion'
import { SamCliVersionValidator, SamCliVersionValidatorResult } from '../../../../shared/sam/cli/samCliVersionValidator'

describe('SamCliVersionValidator', async () => {
    it('validates', async () => {

        const validator = new SamCliVersionValidator({
            getSamCliVersion: async () => SamCliVersion.MINIMUM_SAM_CLI_VERSION_INCLUSIVE
        })

        const validationResult: SamCliVersionValidatorResult = await validator.validate()

        assert.strictEqual(validationResult.version, SamCliVersion.MINIMUM_SAM_CLI_VERSION_INCLUSIVE)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.Valid)
    })

    it('rejects out-of-date versions', async () => {
        const testLowLevel = '0.0.1'
        const validator = new SamCliVersionValidator({
            getSamCliVersion: async () => testLowLevel
        })

        const validationResult: SamCliVersionValidatorResult = await validator.validate()

        assert.strictEqual(validationResult.version, testLowLevel)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionTooLow)
    })

    it('rejects versions that are too new', async () => {
        const testHighLevel = '999999.9999.999999'
        const validator = new SamCliVersionValidator({
            getSamCliVersion: async () => testHighLevel
        })

        const validationResult: SamCliVersionValidatorResult = await validator.validate()

        assert.strictEqual(validationResult.version, testHighLevel)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionTooHigh)
    })

    it('rejects versions that are not valid semver versions', async () => {
        const testWrongLevel = 'what.in.tarnation'
        const validator = new SamCliVersionValidator({
            getSamCliVersion: async () => testWrongLevel
        })

        const validationResult: SamCliVersionValidatorResult = await validator.validate()

        assert.strictEqual(validationResult.version, testWrongLevel)
        assert.strictEqual(validationResult.validation, SamCliVersionValidation.VersionNotParseable)
    })
})
