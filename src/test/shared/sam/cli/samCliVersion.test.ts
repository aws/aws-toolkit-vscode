/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as semver from 'semver'
import { SamCliVersion, SamCliVersionValidation } from '../../../../shared/sam/cli/samCliVersion'

describe('SamCliVersion', async () => {

    it('validates undefined version', async () => {
        assert.strictEqual(SamCliVersion.validate(), SamCliVersionValidation.VersionNotParseable)
    })

    it('validates valid versions', async () => {
        assertSamCliVersionValidationWorks({
            expectedResult: SamCliVersionValidation.Valid,
            versionsToTest: [
                SamCliVersion.MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
                '0.7.1',
                '0.8.0',
                '0.10.999',
            ]

        })
    })

    it('validates earlier versions', async () => {
        assertSamCliVersionValidationWorks({
            expectedResult: SamCliVersionValidation.VersionTooLow,
            versionsToTest: [
                '0.6.0',
                '0.0.1',
            ]
        })
    })

    it('validates later versions', async () => {
        assertSamCliVersionValidationWorks({
            expectedResult: SamCliVersionValidation.VersionTooHigh,
            versionsToTest: [
                SamCliVersion.MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE,
                semver.parse(SamCliVersion.MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE)!.inc('patch').version,
                '0.17.1',
                '0.999.0',
            ]
        })
    })

    it('validates garbage text', async () => {
        assertSamCliVersionValidationWorks({
            expectedResult: SamCliVersionValidation.VersionNotParseable,
            versionsToTest: [
                'abc',
                'fakeVersion',
            ]
        })
    })

    const assertSamCliVersionValidationWorks = (params: {
        versionsToTest: string[],
        expectedResult: SamCliVersionValidation
    }) => {
        params.versionsToTest.forEach(version => {
            const validation = SamCliVersion.validate(version)
            assert.strictEqual(
                validation, params.expectedResult,
                `Expected ${version} to be ${params.expectedResult}`
            )
        })
    }
})
