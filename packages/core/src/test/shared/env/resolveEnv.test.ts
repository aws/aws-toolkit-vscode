/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as resolveEnv from '../../../shared/env/resolveEnv'
import sinon from 'sinon'
import path from 'path'

describe('resolveEnv', async function () {
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    // a copy of resolveEnv.mergeResolvedShellPath for stubbing getResolvedShellEnv
    // mergeResolvedShellPath is calling getResolvedShellEnv within the same file
    // thus we need a copy to stub getResolvedShellEnv correctly
    const testMergeResolveShellPath = async function mergeResolvedShellPath(
        env: resolveEnv.IProcessEnvironment
    ): Promise<typeof process.env> {
        const shellEnv = await resolveEnv.getResolvedShellEnv(env)
        // resolve failed or doesn't need to resolve
        if (!shellEnv) {
            return env
        }
        try {
            const envPaths: string[] = env.PATH ? env.PATH.split(path.delimiter) : []
            const resolvedPaths: string[] = shellEnv.PATH ? shellEnv.PATH.split(path.delimiter) : []
            const envReturn = { ...env }
            // merge, dedup, join
            envReturn.PATH = [...new Set(envPaths.concat(resolvedPaths))].join(path.delimiter)

            return envReturn
        } catch (err) {
            return env
        }
    }

    describe('windows', async function () {
        beforeEach(function () {
            sandbox.stub(process, 'platform').value('win32')
        })

        it('mergeResolvedShellPath should not change path on windows', async function () {
            const env = await resolveEnv.mergeResolvedShellPath(process.env)
            assert(env.PATH)
            assert.strictEqual(env, process.env)
        })
    })

    describe('unix', async function () {
        const originalEnv = { ...process.env }
        // skip mac test on windows
        if (process.platform !== 'win32') {
            it('mergeResolvedShellPath should get path on mac/linux', async function () {
                sandbox.stub(process.env, 'PATH').value('')
                // stub the resolve Env logic cause this is platform sensitive.
                sandbox.stub(resolveEnv, 'getResolvedShellEnv').resolves(originalEnv)
                const env = await testMergeResolveShellPath(process.env)
                assert(env.PATH)
                assert.notEqual(env, process.env)
            })
        }
    })
})
