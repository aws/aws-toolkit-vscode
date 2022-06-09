/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { buildLoginUri, consoleProxyUri } from '../../../shared/deeplinks/federation'

describe('buildLoginUri', function () {
    const token = 'token'
    const region = 'us-east-1'

    it('throws for relative paths', function () {
        assert.throws(() => buildLoginUri(token, region, 'a/relative/path'))
    })

    it('uses the federation endpoint', function () {
        const uri = buildLoginUri(token, region)
        assert.strictEqual(uri.authority, 'signin.aws.amazon.com')
        assert.strictEqual(uri.path, '/federation')
    })

    it('uses the region as a sub-domain if the region is not a primary', function () {
        const uri = buildLoginUri(token, 'us-west-2')
        assert.strictEqual(uri.authority, 'us-west-2.signin.aws.amazon.com')
        assert.strictEqual(uri.path, '/federation')
    })

    it('sets query params using the provided token and region', function () {
        const uri = buildLoginUri(token, region)
        const destination = consoleProxyUri(region).toString(true)
        assert.strictEqual(uri.query, `Action=login&SigninToken=${token}&Destination=${destination}`)
    })
})
