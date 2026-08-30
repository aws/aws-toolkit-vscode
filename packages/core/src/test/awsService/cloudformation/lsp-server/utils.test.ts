/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CfnTarget, CfnLspVersion, CfnManifest } from '../../../../awsService/cloudformation/lsp-server/utils'

describe('CloudFormation LSP utils - types', () => {
    it('CfnTarget extends Target with optional nodejs field', () => {
        const target: CfnTarget = {
            platform: 'darwin',
            arch: 'arm64',
            contents: [{ filename: 'test.zip', url: 'https://example.com/test.zip', hashes: [], bytes: 100 }],
            nodejs: '22',
        }
        assert.strictEqual(target.nodejs, '22')
        assert.strictEqual(target.platform, 'darwin')
    })

    it('CfnTarget works without nodejs field', () => {
        const target: CfnTarget = {
            platform: 'linux',
            arch: 'x64',
            contents: [],
        }
        assert.strictEqual(target.nodejs, undefined)
    })

    it('CfnLspVersion has typed targets array', () => {
        const version: CfnLspVersion = {
            serverVersion: '1.0.0',
            isDelisted: false,
            targets: [
                { platform: 'darwin', arch: 'arm64', contents: [], nodejs: '22' },
                { platform: 'linux', arch: 'x64', contents: [] },
            ],
        }
        assert.strictEqual(version.targets.length, 2)
        assert.strictEqual(version.targets[0].nodejs, '22')
    })

    it('CfnManifest has typed versions array', () => {
        const manifest: CfnManifest = {
            manifestSchemaVersion: '1.0',
            artifactId: 'cloudformation-languageserver',
            artifactDescription: 'CloudFormation Language Server',
            isManifestDeprecated: false,
            versions: [
                {
                    serverVersion: '1.0.0',
                    isDelisted: false,
                    targets: [{ platform: 'darwin', arch: 'arm64', contents: [] }],
                },
            ],
        }
        assert.strictEqual(manifest.versions.length, 1)
        assert.strictEqual(manifest.versions[0].serverVersion, '1.0.0')
    })
})
