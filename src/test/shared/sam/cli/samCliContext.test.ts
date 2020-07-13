/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getSamCliDockerImageNameWithRuntime } from '../../../../shared/sam/cli/samCliContext'

describe('getSamCliDockerImageNameWithRuntime', () => {
    it('returns the correct values', () => {
        const runtime = 'funtime'
        const amazonImage = `amazon/aws-sam-cli-emulation-image-${runtime}`
        const legacyImage = `lambci/lambda:${runtime}`

        assert.strictEqual(getSamCliDockerImageNameWithRuntime('0.0.0', runtime), legacyImage)
        assert.strictEqual(getSamCliDockerImageNameWithRuntime('1.0.0', runtime), amazonImage)
        assert.strictEqual(getSamCliDockerImageNameWithRuntime('999.999.9999', runtime), amazonImage)
        assert.strictEqual(getSamCliDockerImageNameWithRuntime(undefined, runtime), amazonImage)
        assert.strictEqual(getSamCliDockerImageNameWithRuntime('1.0.0rc', runtime), amazonImage)
    })
})
