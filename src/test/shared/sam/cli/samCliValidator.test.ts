/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SamCliInfoResponse } from '../../../../shared/sam/cli/samCliInfo'
import {
    DefaultSamCliValidator,
    MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
    SamCliValidatorContext,
    SamCliVersionValidation,
} from '../../../../shared/sam/cli/samCliValidator'

describe('DefaultSamCliValidator', async () => {
    class TestSamCliValidatorContext implements SamCliValidatorContext {
        public samCliVersionId: string = new Date().valueOf().toString()
        public getInfoCallCount: number = 0
        public samCliLocation: string | undefined

        public constructor(public samCliVersion: string) {}

        public async getSamCliExecutableId(): Promise<string> {
            return this.samCliVersionId
        }
        public async getSamCliInfo(): Promise<SamCliInfoResponse> {
            this.getInfoCallCount++

            return {
                version: this.samCliVersion,
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
            version: 'what.in.tarnation',
            expectedVersionValidation: SamCliVersionValidation.VersionNotParseable,
        },
    ]

    describe('detectValidSamCli', async () => {
        samCliVersionTestScenarios.forEach(test => {
            it(`handles case where SAM CLI exists and ${test.situation}`, async () => {
                const validatorContext = new TestSamCliValidatorContext(test.version)
                validatorContext.samCliLocation = 'somesamclipath'
                const samCliValidator = new DefaultSamCliValidator(validatorContext)

                const validatorResult = await samCliValidator.detectValidSamCli()

                assert.ok(validatorResult)
                assert.strictEqual(validatorResult.samCliFound, true, 'Expected to find sam cli')
                assert.ok(validatorResult.versionValidation)
                assert.strictEqual(validatorResult.versionValidation!.version, test.version, 'sam cli version mismatch')
                assert.strictEqual(
                    validatorResult.versionValidation!.validation,
                    test.expectedVersionValidation,
                    'sam cli version validation mismatch'
                )
            })
        })

        it('handles case where SAM CLI is not found', async () => {
            const validatorContext = new TestSamCliValidatorContext('')
            validatorContext.samCliLocation = undefined
            const samCliValidator = new DefaultSamCliValidator(validatorContext)

            const validatorResult = await samCliValidator.detectValidSamCli()

            assert.ok(validatorResult)
            assert.strictEqual(validatorResult.samCliFound, false, 'Expected sam cli to be not found')
        })
    })

    describe('getVersionValidatorResult', async () => {
        samCliVersionTestScenarios.forEach(test => {
            it(`Validates SAM CLI binary for the case: ${test.situation}`, async () => {
                const validatorContext = new TestSamCliValidatorContext(test.version)
                const samCliValidator = new DefaultSamCliValidator(validatorContext)

                const validatorResult = await samCliValidator.getVersionValidatorResult()

                assert.ok(validatorResult)
                assert.strictEqual(validatorResult.version, test.version, 'sam cli version mismatch')
                assert.strictEqual(
                    validatorResult.validation,
                    test.expectedVersionValidation,
                    'sam cli version validation mismatch'
                )
            })
        })

        it('Uses the cached validation result', async () => {
            const validatorContext = new TestSamCliValidatorContext(MINIMUM_SAM_CLI_VERSION_INCLUSIVE)
            const samCliValidator = new DefaultSamCliValidator(validatorContext)

            await samCliValidator.getVersionValidatorResult()
            await samCliValidator.getVersionValidatorResult()

            assert.strictEqual(validatorContext.getInfoCallCount, 1, 'getInfo called more than once')
        })

        it('Does not use the cached validation result if the SAM CLI timestamp changed', async () => {
            const validatorContext = new TestSamCliValidatorContext(MINIMUM_SAM_CLI_VERSION_INCLUSIVE)
            const samCliValidator = new DefaultSamCliValidator(validatorContext)

            await samCliValidator.getVersionValidatorResult()

            // Oh look, a new SAM CLI timestamp
            validatorContext.samCliVersionId = validatorContext.samCliVersionId + 'x'
            await samCliValidator.getVersionValidatorResult()

            assert.strictEqual(validatorContext.getInfoCallCount, 2, 'getInfo was not called both times')
        })
    })

    describe('validateSamCliVersion', async () => {
        samCliVersionTestScenarios.forEach(test => {
            it(`validates when ${test.situation}`, async () => {
                const validation: SamCliVersionValidation = DefaultSamCliValidator.validateSamCliVersion(test.version)

                assert.strictEqual(validation, test.expectedVersionValidation, 'Unexpected version validation')
            })
        })
    })
})
