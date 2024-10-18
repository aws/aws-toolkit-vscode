/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { envWithNewPath, readEnv, setEnv } from '../../testUtil'

describe('envWithNewPath', function () {
    it('gives current path with new PATH', function () {
        const fakePath = 'fakePath'
        assert.deepStrictEqual(envWithNewPath(fakePath), { ...process.env, PATH: fakePath })
    })
})

describe('writeEnv', function () {
    it('modifies the node environment variables', function () {
        const originalEnv = readEnv()
        const fakePath = 'fakePath'
        setEnv(envWithNewPath('fakePath'))
        assert.strictEqual(readEnv().PATH, fakePath)

        setEnv(originalEnv)
        assert.deepStrictEqual(readEnv(), originalEnv)
    })
})
