/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { runCmd } from './testUtils'

describe('eslint', function () {
    this.timeout(180_000)

    it('passes eslint', function () {
        const result = runCmd(
            [
                '../../node_modules/.bin/eslint',
                '-c',
                '../../.eslintrc.js',
                // Note: eslint currently does not support multiple  --ignore-path args.
                // Use --ignore-pattern as a workaround.
                '--ignore-path',
                '../../.gitignore',
                '--ignore-pattern',
                '**/*.json',
                '--ignore-pattern',
                '**/*.gen.ts',
                '--ignore-pattern',
                '**/types/*.d.ts',
                '--ignore-pattern',
                '**/src/testFixtures/**',
                '--ext',
                '.ts',
                '../amazonq',
                '../core',
                '../toolkit',
                // TODO: fix lint issues in scripts/
                // '../../scripts',
            ],
            {
                throws: false,
            }
        )
        assert.strictEqual(result.status, 0, result.output.toString())
    })
})
