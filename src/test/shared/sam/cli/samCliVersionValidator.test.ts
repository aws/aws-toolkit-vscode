/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import '../../vscode/initialize'

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
})
