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
            getSamCliVersion: async () => SamCliVersion.MAXIMUM_SAM_CLI_VERSION
        })

        const validationResult: SamCliVersionValidatorResult = await validator.validate()

        assert.equal(validationResult.version, SamCliVersion.MAXIMUM_SAM_CLI_VERSION)
        assert.equal(validationResult.validation, SamCliVersionValidation.Valid)
    })
})
