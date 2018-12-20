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
        assert.equal(SamCliVersion.validate(), SamCliVersionValidation.VersionNotParseable)
    })

    it('validates valid versions', async () => {
        [
            SamCliVersion.MINIMUM_SAM_CLI_VERSION,
            SamCliVersion.MAXIMUM_SAM_CLI_VERSION,
            '0.7.1',
            '0.8.0',
            '0.10.999',
        ].forEach(version => {
            const validation = SamCliVersion.validate(version)
            assert.equal(
                validation, SamCliVersionValidation.Valid,
                `Version: ${version}, Validation: ${SamCliVersionValidation[validation]}`
            )
        })
    })

    it('validates earlier versions', async () => {
        [
            '0.6.0',
            '0.0.1',
        ].forEach(version => {
            const validation = SamCliVersion.validate(version)
            assert.equal(
                validation, SamCliVersionValidation.VersionTooLow,
                `Version: ${version}, Validation: ${SamCliVersionValidation[validation]}`
            )
        })
    })

    it('validates later versions', async () => {
        [
            semver.parse(SamCliVersion.MAXIMUM_SAM_CLI_VERSION)!.inc('patch').version,
            '0.11.1',
            '0.999.0',
        ].forEach(version => {
            const validation = SamCliVersion.validate(version)
            assert.equal(
                validation, SamCliVersionValidation.VersionTooHigh,
                `Version: ${version}, Validation: ${SamCliVersionValidation[validation]}`
            )
        })
    })

    it('validates garbage text', async () => {
        [
            'abc',
            'fakeVersion',
            '0-1-2',
        ].forEach(version => {
            const validation = SamCliVersion.validate(version)
            assert.equal(
                validation, SamCliVersionValidation.VersionNotParseable,
                `Version: ${version}, Validation: ${SamCliVersionValidation[validation]}`
            )
        })
    })

})
