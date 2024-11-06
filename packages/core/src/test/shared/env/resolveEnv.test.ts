/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { mergeResolvedShellPath } from '../../../shared/env/resolveEnv'
import sinon from 'sinon'
import { EnvironmentVariables } from '../../../shared/environmentVariables'

describe('resolveEnv', async function () {
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
        sandbox.stub(process, 'env').value({
            platform: 'win32',
        } as EnvironmentVariables)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('resolveWindows', async function () {
        it('mergeResolvedShellPath should not change path on windows', async function () {
            const env = await mergeResolvedShellPath(process.env)
            assert.strictEqual(env.path, process.env.path)
        })
    })
})
