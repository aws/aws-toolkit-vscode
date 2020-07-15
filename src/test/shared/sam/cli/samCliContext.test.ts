/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getSamCliDockerImageName } from '../../../../shared/sam/cli/samCliContext'

describe('getSamCliDockerImageName', () => {
    it('returns the correct values', () => {
        const runtime = 'funtime'
        const amazonImage = `amazon/aws-sam-cli-emulation-image-${runtime}`
        const legacyImage = `lambci/lambda:${runtime}`

        assert.strictEqual(getSamCliDockerImageName('0.0.0', runtime), legacyImage)
        assert.strictEqual(getSamCliDockerImageName('1.0.0', runtime), amazonImage)
        assert.strictEqual(getSamCliDockerImageName('999.999.9999', runtime), amazonImage)
        assert.strictEqual(getSamCliDockerImageName(undefined, runtime), amazonImage)
        assert.strictEqual(getSamCliDockerImageName('1.0.0rc', runtime), amazonImage)
    })
})
