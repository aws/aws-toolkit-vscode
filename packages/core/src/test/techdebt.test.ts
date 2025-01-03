/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as semver from 'semver'
import * as env from '../shared/vscode/env'

// Checks project config and dependencies, to remind us to remove old things
// when possible.
describe('tech debt', function () {
    // @ts-ignore
    function fixByDate(date: string, msg: string) {
        const now = Date.now()
        const cutoffDate = Date.parse(date)
        assert.ok(now <= cutoffDate, msg)
    }

    it('vscode minimum version', async function () {
        const minVscode = env.getMinVscodeVersion()
        assert.ok(semver.lt(minVscode, '1.84.0'))

        // see https://github.com/microsoft/vscode/issues/173861
        assert.ok(
            semver.lt(minVscode, '1.93.0'),
            'keepAlive works properly in vscode 1.93+. Remove src/codewhisperer/client/agent.ts and other code related to https://github.com/aws/aws-toolkit-vscode-staging/pull/1214'
        )
    })

    it('nodejs minimum version', async function () {
        const minNodejs = env.getMinNodejsVersion()

        // XXX: available since node 16, but not sure how much work this will be, yet.
        assert.ok(
            semver.lt(minNodejs, '18.0.0'),
            'with node16+, we can now use AbortController to cancel Node things (child processes, HTTP requests, etc.)'
        )
        // This is relevant for the use of `fs.cpSync` in the copyFiles scripts.
        assert.ok(semver.lt(minNodejs, '18.0.0'), 'with node18+, we can remove the dependency on @types/node@18')
    })
})
