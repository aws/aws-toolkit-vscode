/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as semver from 'semver'
import * as env from '../shared/vscode/env'

// Checks project config and dependencies, to remind us to remove old things
// when possible.
describe('tech debt', function () {
    it('vscode minimum version', async function () {
        const minVscode = env.getMinVscodeVersion()

        assert.ok(
            semver.lt(minVscode, '1.53.0'),
            'remove src/shared/vscode/secrets.ts wrapper from https://github.com/aws/aws-toolkit-vscode/pull/2626'
        )

        assert.ok(
            semver.lt(minVscode, '1.53.0'),
            'remove `SecretMemento` from src/caws/auth.ts added in https://github.com/aws/aws-toolkit-vscode-staging/pull/466'
        )

        assert.ok(
            semver.lt(minVscode, '1.51.0'),
            'remove filesystemUtilities.findFile(), use vscode.workspace.findFiles() instead'
        )

        assert.ok(semver.lt(minVscode, '1.64.0'), 'remove QuickPickItemKind stub in pickCredentialProfile()')
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
    })
})
