/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as semver from 'semver'
import { getMinVscodeVersion } from '../shared/vscode/env'

// Checks project config and dependencies, to remind us to remove old things
// when possible.
describe('tech debt', function () {
    it('vscode minimum version', async function () {
        const minVscode = getMinVscodeVersion()

        assert.ok(
            semver.lt(minVscode, '1.53.0'),
            'remove src/shared/vscode/secrets.ts wrapper from https://github.com/aws/aws-toolkit-vscode/pull/2626'
        )

        assert.ok(
            semver.lt(minVscode, '1.51.0'),
            'remove filesystemUtilities.findFile(), use vscode.workspace.findFiles() instead'
        )
    })
})
