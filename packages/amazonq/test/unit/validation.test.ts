/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import packageJson from '../../package.json'
import { fs } from 'aws-core-vscode/shared'

/**
 * Validate the setup of the project itself.
 */

describe('package validations', function () {
    /**
     * Type checking depends on icon entries in core/package.json.
     * To ensure that the extension has the the typed icons available, they must be synced
     * to the local package.json. This test ensures that any hand modifications to individual
     * package.jsons are detected.
     *
     * See icons.md for more info.
     */
    it('has synced contributes.icons with core/package.json', async function () {
        const corePackageJson = JSON.parse(
            await fs.readFileText(path.resolve(__dirname, '../../../../core/package.json'))
        )
        assert.deepStrictEqual(packageJson.contributes.icons, corePackageJson.contributes.icons)
    })
})
