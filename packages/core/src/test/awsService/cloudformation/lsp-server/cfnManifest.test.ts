/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { parseCfnManifest } from '../../../../awsService/cloudformation/lsp-server/cfnManifest'

describe('parseCfnManifest', () => {
    it('prefers version marked as latest', () => {
        const manifest = parseCfnManifest(
            JSON.stringify({
                manifestSchemaVersion: '1.0',
                isManifestDeprecated: false,
                prod: [
                    { serverVersion: '1.4.0', latest: true, isDelisted: false, targets: [] },
                    { serverVersion: '1.2.0', latest: false, isDelisted: false, targets: [] },
                ],
            }),
            'prod'
        )

        assert.strictEqual(manifest.versions.length, 1)
        assert.strictEqual(manifest.versions[0].serverVersion, '1.4.0')
    })

    it('falls back to all versions when no latest flag', () => {
        const manifest = parseCfnManifest(
            JSON.stringify({
                manifestSchemaVersion: '1.0',
                isManifestDeprecated: false,
                prod: [
                    { serverVersion: '1.4.0', isDelisted: false, targets: [] },
                    { serverVersion: '1.2.0', isDelisted: false, targets: [] },
                ],
            }),
            'prod'
        )

        assert.strictEqual(manifest.versions.length, 2)
    })

    it('falls back to all versions when latest is delisted', () => {
        const manifest = parseCfnManifest(
            JSON.stringify({
                manifestSchemaVersion: '1.0',
                isManifestDeprecated: false,
                prod: [
                    { serverVersion: '1.4.0', latest: true, isDelisted: true, targets: [] },
                    { serverVersion: '1.2.0', latest: false, isDelisted: false, targets: [] },
                ],
            }),
            'prod'
        )

        assert.strictEqual(manifest.versions.length, 2)
        assert.strictEqual(manifest.versions[0].serverVersion, '1.4.0')
        assert.strictEqual(manifest.versions[1].serverVersion, '1.2.0')
    })

    it('reads correct environment array', () => {
        const manifest = parseCfnManifest(
            JSON.stringify({
                manifestSchemaVersion: '1.0',
                isManifestDeprecated: false,
                prod: [{ serverVersion: '1.4.0', latest: true, isDelisted: false, targets: [] }],
                beta: [{ serverVersion: '1.4.0-beta', latest: true, isDelisted: false, targets: [] }],
            }),
            'beta'
        )

        assert.strictEqual(manifest.versions.length, 1)
        assert.strictEqual(manifest.versions[0].serverVersion, '1.4.0-beta')
    })

    it('preserves isManifestDeprecated', () => {
        const manifest = parseCfnManifest(
            JSON.stringify({
                manifestSchemaVersion: '1.0',
                isManifestDeprecated: true,
                prod: [{ serverVersion: '1.4.0', latest: true, isDelisted: false, targets: [] }],
            }),
            'prod'
        )

        assert.strictEqual(manifest.isManifestDeprecated, true)
    })
})
