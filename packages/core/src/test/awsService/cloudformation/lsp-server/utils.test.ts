/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { dedupeAndGetLatestVersions } from '../../../../awsService/cloudformation/lsp-server/utils'
import { LspVersion } from '../../../../shared/lsp/types'

describe('dedupeAndGetLatestVersions', () => {
    for (const prefix of ['v', '']) {
        it(`handles versions with timestamp: ${prefix}`, () => {
            const result = dedupeAndGetLatestVersions(
                generateLspVersion(['0.0.1-2020', '0.0.2-2024', '0.0.3-2026', '0.0.2-2025', '0.0.3-2030'], prefix)
            )

            assert.strictEqual(result.length, 3)
            assert.strictEqual(result[0].serverVersion, '0.0.3-2030')
            assert.strictEqual(result[1].serverVersion, '0.0.2-2025')
            assert.strictEqual(result[2].serverVersion, '0.0.1-2020')
        })

        it('handles versions with timestamp and environment', () => {
            const result = dedupeAndGetLatestVersions(
                generateLspVersion(
                    ['0.0.1-2020-alpha', '0.0.2-2024-beta', '0.0.3-2026-alpha', '0.0.2-2025-prod', '0.0.3-2030-beta'],
                    prefix
                )
            )

            assert.strictEqual(result.length, 3)
            assert.strictEqual(result[0].serverVersion, '0.0.3-2030-beta')
            assert.strictEqual(result[1].serverVersion, '0.0.2-2025-prod')
            assert.strictEqual(result[2].serverVersion, '0.0.1-2020-alpha')
        })
    }

    function generateLspVersion(versions: string[], prefix: string = ''): LspVersion[] {
        return versions.map((version) => {
            return { serverVersion: `${prefix}${version}`, targets: [], isDelisted: false }
        })
    }
})
