/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { mergeResolvedShellPath } from '../../../shared/env/resolveEnv'
import sinon from 'sinon'

describe('resolveEnv', async function () {
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
        sandbox.stub(process, 'platform').value('win32')
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('resolveWindows', async function () {
        beforeEach(function () {
            sandbox.stub(process, 'platform').value('win32')
        })

        it('mergeResolvedShellPath should not change path on windows', async function () {
            const env = await mergeResolvedShellPath(process.env)
            assert(env.PATH)
            assert.strictEqual(env, process.env)
        })
    })

    describe('resolveMac', async function () {
        beforeEach(function () {
            sandbox.stub(process, 'platform').value('darwin')
        })

        it('mergeResolvedShellPath should get path on mac', async function () {
            sandbox.stub(process.env, 'PATH').value('')
            const env = await mergeResolvedShellPath(process.env)
            assert(env.PATH)
            assert.notEqual(env, process.env)
        })
    })
})
