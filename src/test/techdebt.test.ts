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

    it('remove explicit sam cli version', function () {
        // Indicate to start using the latest aws-sam-cli version in our CI
        // https://issues.amazon.com/issues/IDE-11386
        const nextMonth = new Date(2023, 8, 12) // September 12th, 2023
        const now = new Date()
        assert(
            now < nextMonth,
            'Remove use of 1.94.0 for aws-sam-cli in linuxIntegrationTests.yml and see if integration tests are passing now'
        )
    })

    it('stop skipping CodeCatalyst E2E Tests', function () {
        // https://issues.amazon.com/issues/IDE-10496
        const nextMonth = new Date(2023, 8, 12) // September 12th, 2023
        const now = new Date()
        assert(now < nextMonth, 'Re-evaluate if we should still keep skipping CodeCatalyst E2E Tests')
    })
})
