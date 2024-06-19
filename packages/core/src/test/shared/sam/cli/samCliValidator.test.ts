/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import globals from '../../../../shared/extensionGlobals'
import { SamCliInfoResponse } from '../../../../shared/sam/cli/samCliInfo'
import {
    DefaultSamCliValidator,
    maxSamCliVersionExclusive,
    minSamCliVersion,
    SamCliValidatorContext,
    SamCliVersionValidation,
} from '../../../../shared/sam/cli/samCliValidator'

describe('DefaultSamCliValidator', async function () {
    class TestSamCliValidatorContext implements SamCliValidatorContext {
        public samCliVersionId: string = new globals.clock.Date().valueOf().toString()
        public getInfoCallCount: number = 0
        public mockSamLocation: string = ''

        public constructor(public samCliVersion: string) {}

        public async samCliLocation(): Promise<string> {
            return this.mockSamLocation
        }

        public async getSamCliInfo(): Promise<SamCliInfoResponse> {
            this.getInfoCallCount++

            return {
                version: this.samCliVersion,
            }
        }
    }

    const scenarios = [
        {
            situation: 'valid version string',
            version: minSamCliVersion,
            expected: SamCliVersionValidation.Valid,
        },
        {
            situation: '"nightly" version',
            version: '1.86.1-dev202306120901',
            expected: SamCliVersionValidation.Valid,
        },
        {
            situation: 'version too low',
            version: '0.1.0',
            expected: SamCliVersionValidation.VersionTooLow,
        },
        {
            situation: 'version too high',
            version: maxSamCliVersionExclusive,
            expected: SamCliVersionValidation.VersionTooHigh,
        },
        {
            situation: 'version unparsable (empty string)',
            version: '',
            expected: SamCliVersionValidation.VersionNotParseable,
        },
        {
            situation: 'version unparsable (random text)',
            version: 'what.in.tarnation',
            expected: SamCliVersionValidation.VersionNotParseable,
        },
    ] as const

    describe('detectValidSamCli', async function () {
        scenarios.forEach(test => {
            it(`found SAM CLI, ${test.situation}`, async () => {
                const validatorContext = new TestSamCliValidatorContext(test.version)
                validatorContext.mockSamLocation = 'somesamclipath'
                const samCliValidator = new DefaultSamCliValidator(validatorContext)
                const actual = await samCliValidator.detectValidSamCli()

                assert.strictEqual(actual.samCliFound, true, 'Expected to find sam cli')
                assert.strictEqual(actual.versionValidation?.version, test.version)
                assert.strictEqual(actual.versionValidation?.validation, test.expected)
            })
        })

        it('SAM CLI not found', async function () {
            const validatorContext = new TestSamCliValidatorContext('')
            validatorContext.mockSamLocation = ''
            const samCliValidator = new DefaultSamCliValidator(validatorContext)
            const actual = await samCliValidator.detectValidSamCli()

            assert.strictEqual(actual.samCliFound, false, 'Expected sam cli NOT found')
        })
    })

    describe('getVersionValidatorResult', async function () {
        scenarios.forEach(test => {
            it(test.situation, async () => {
                const validatorContext = new TestSamCliValidatorContext(test.version)
                const samCliValidator = new DefaultSamCliValidator(validatorContext)
                const actual = await samCliValidator.getVersionValidatorResult()

                assert.strictEqual(actual.version, test.version)
                assert.strictEqual(actual.validation, test.expected)
            })
        })
    })

    describe('validateSamCliVersion', async function () {
        scenarios.forEach(test => {
            it(test.situation, async () => {
                const validation = DefaultSamCliValidator.validateSamCliVersion(test.version)
                assert.strictEqual(validation, test.expected)
            })
        })
    })
})
