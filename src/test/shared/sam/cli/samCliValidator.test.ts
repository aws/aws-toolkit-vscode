/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Stats } from 'fs'
import { SamCliInfoResponse } from '../../../../shared/sam/cli/samCliInvokerUtils'
// TODO : Move SamCliInfoResponse back to samCliInfo
// import { SamCliInfoResponse } from '../../../../shared/sam/cli/samCliInfo'
import { BaseSamCliValidator } from '../../../../shared/sam/cli/samCliValidator'
import {
    MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
    SamCliVersionValidation
} from '../../../../shared/sam/cli/samCliVersionValidator'

describe('BaseSamCliValidator', async () => {

    class TestSamCliValidator extends BaseSamCliValidator {

        public samCliStatMtime: Date = new Date()
        public getInfoCallCount: number = 0
        public samCliLocation: string | undefined

        public constructor(public samCliVersion: string) {
            super()
        }

        protected async getSamCliStat(samCliLocation: string): Promise<Pick<Stats, 'mtime'>> {
            return {
                mtime: this.samCliStatMtime
            }
        }

        protected getSamCliLocation(): string | undefined {
            return this.samCliLocation
        }

        protected async getInfo(samCliLocation: string): Promise<SamCliInfoResponse> {
            this.getInfoCallCount++

            return {
                version: this.samCliVersion
            }
        }
    }

    const samCliVersionTestScenarios = [
        {
            situation: 'SAM CLI Version is valid',
            version: MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
            expectedVersionValidation: SamCliVersionValidation.Valid,
        },
        {
            situation: 'SAM CLI Version is too low',
            version: '0.1.0',
            expectedVersionValidation: SamCliVersionValidation.VersionTooLow,
        },
        {
            situation: 'SAM CLI Version is too high',
            version: MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
            expectedVersionValidation: SamCliVersionValidation.VersionTooHigh,
        },
        {
            situation: 'SAM CLI Version is unparsable - empty string',
            version: '',
            expectedVersionValidation: SamCliVersionValidation.VersionNotParseable,
        },
        {
            situation: 'SAM CLI Version is unparsable - random text',
            version: 'qwerty',
            expectedVersionValidation: SamCliVersionValidation.VersionNotParseable,
        },
    ]

    describe('detectValidSamCli', async () => {
        samCliVersionTestScenarios.forEach(test => {
            it(`handles case where SAM CLI exists and ${test.situation}`, async () => {
                const samCliValidator = new TestSamCliValidator(test.version)
                samCliValidator.samCliLocation = 'somesamclipath'

                const validatorResult = await samCliValidator.detectValidSamCli()

                assert.ok(validatorResult)
                assert.strictEqual(validatorResult.samCliFound, true, 'Expected to find sam cli')
                assert.ok(validatorResult.versionValidation)
                assert.strictEqual(validatorResult.versionValidation!.version, test.version, 'sam cli version mismatch')
                assert.strictEqual(
                    validatorResult.versionValidation!.validation, test.expectedVersionValidation,
                    'sam cli version validation mismatch'
                )
            })
        })

        it('handles case where SAM CLI is not found', async () => {
            const samCliValidator = new TestSamCliValidator('')
            samCliValidator.samCliLocation = undefined

            const validatorResult = await samCliValidator.detectValidSamCli()

            assert.ok(validatorResult)
            assert.strictEqual(validatorResult.samCliFound, false, 'Expected sam cli to be not found')
        })
    })

    describe('getVersionValidatorResult', async () => {

        samCliVersionTestScenarios.forEach(test => {
            it(`Validates SAM CLI binary for the case: ${test.situation}`, async () => {
                const samCliValidator = new TestSamCliValidator(test.version)

                const validatorResult = await samCliValidator.getVersionValidatorResult('samclipath')

                assert.ok(validatorResult)
                assert.strictEqual(validatorResult.version, test.version, 'sam cli version mismatch')
                assert.strictEqual(
                    validatorResult.validation, test.expectedVersionValidation,
                    'sam cli version validation mismatch'
                )
            })
        })

        it('Uses the cached validation result', async () => {
            const samCliValidator = new TestSamCliValidator(MINIMUM_SAM_CLI_VERSION_INCLUSIVE)

            await samCliValidator.getVersionValidatorResult('samclipath')
            await samCliValidator.getVersionValidatorResult('samclipath')

            assert.strictEqual(samCliValidator.getInfoCallCount, 1, 'getInfo called more than once')
        })

        it('Does not use the cached validation result if the SAM CLI timestamp changed', async () => {
            const samCliValidator = new TestSamCliValidator(MINIMUM_SAM_CLI_VERSION_INCLUSIVE)

            await samCliValidator.getVersionValidatorResult('samclipath')

            // Oh look, a new SAM CLI timestamp
            samCliValidator.samCliStatMtime = new Date(1 + samCliValidator.samCliStatMtime.valueOf())
            await samCliValidator.getVersionValidatorResult('samclipath')

            assert.strictEqual(samCliValidator.getInfoCallCount, 2, 'getInfo was not called both times')
        })
    })

})
