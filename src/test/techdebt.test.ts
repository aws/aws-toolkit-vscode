/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as semver from 'semver'
import * as env from '../shared/vscode/env'
import { installVSCodeExtension } from '../../scripts/test/launchTestUtilities'

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

    it('stop not using latest python extension version in integration CI tests', function () {
        /**
         * The explicitly set version is done in {@link installVSCodeExtension}
         * The parent ticket for SAM test issues: IDE-12295
         * Python Extension Bug Issue (if this is fixed, then this should be too): https://github.com/microsoft/vscode-python/issues/22659
         */
        assert(
            new Date() < new Date(2024, 1, 15),
            'Re-evaluate if we can use the latest python extension version in CI integration tests'
        )
    })
})
