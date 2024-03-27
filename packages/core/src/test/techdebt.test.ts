/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as semver from 'semver'
import * as env from '../shared/vscode/env'
import { defaultLogLevel } from '../shared/logger/activation'
import packageJson from '../../package.json'

// Checks project config and dependencies, to remind us to remove old things
// when possible.
describe('tech debt', function () {
    it('vscode minimum version', async function () {
        const minVscode = env.getMinVscodeVersion()

        assert.ok(
            semver.lt(minVscode, '1.75.0'),
            'remove filesystemUtilities.findFile(), use vscode.workspace.findFiles() instead (after Cloud9 VFS fixes bug)'
        )

        assert.ok(
            semver.lt(minVscode, '1.75.0'),
            'remove AsyncLocalStorage polyfill used in `spans.ts` if Cloud9 is on node 14+'
        )
    })

    it('nodejs minimum version', async function () {
        const minNodejs = env.getMinNodejsVersion()

        assert.ok(
            semver.lt(minNodejs, '16.0.0'),
            'remove require("perf_hooks").performance workarounds, use globalThis.performance instead (always available since nodejs 16.x)'
        )

        assert.ok(
            semver.lt(minNodejs, '16.0.0'),
            'with node16+, we can now use AbortController to cancel Node things (child processes, HTTP requests, etc.)'
        )

        assert.ok(
            semver.lt(minNodejs, '16.0.0'),
            'with node16+, we can use crypto.randomUUID and remove the "uuid" dependency'
        )
    })

    it('feature/standalone branch temporary debug log level for testing', async function () {
        if ((process.env.GITHUB_HEAD_REF ?? '').includes('standalone')) {
            this.skip()
        }

        assert.strictEqual(
            defaultLogLevel,
            'info',
            'set loglevel defaults back to info for src/shared/logger/activation.ts. (revert this commit)'
        )

        assert.strictEqual(
            packageJson.contributes.configuration.properties['aws.logLevel'].default,
            'info',
            'set loglevel defaults back to info for packages/amazonq/package.json, packages/toolkit/package.json. (revert this commit)'
        )
    })
})
