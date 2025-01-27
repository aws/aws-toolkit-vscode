/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { LanguageServerResolver, LspResult, Manifest } from '../../../shared'
import { Range } from 'semver'
import { assertTelemetry } from '../../testUtil'

describe('lspResolver', function () {
    let remoteStub: sinon.SinonStub
    let localStub: sinon.SinonStub
    let fallbackStub: sinon.SinonStub
    let manifest: Manifest
    let versionRange: Range

    before(function () {
        remoteStub = sinon.stub(LanguageServerResolver.prototype, 'fetchRemoteServer' as any)
        localStub = sinon.stub(LanguageServerResolver.prototype, 'getLocalServer' as any)
        fallbackStub = sinon.stub(LanguageServerResolver.prototype, 'getFallbackServer' as any)
        manifest = {
            manifestSchemaVersion: '1.0.0',
            artifactId: 'artifact-id',
            artifactDescription: 'artifact-description',
            isManifestDeprecated: false,
            versions: [
                {
                    serverVersion: '1.0.0',
                    isDelisted: false,
                    targets: [
                        {
                            platform: 'linux',
                            arch: 'x64',
                            contents: [
                                {
                                    filename: 'myLS-linux-x64.zip',
                                    url: 'https://example.com/qserver-linux-x64.zip',
                                    hashes: ['sha384:thisisahash'],
                                    bytes: 100,
                                },
                                {
                                    filename: 'node-linux-x64',
                                    url: 'https://example.com/temp-assets/node-linux-x64',
                                    hashes: ['sha384:thisisanotherhash'],
                                    bytes: 200,
                                },
                            ],
                        },
                        {
                            platform: 'linux',
                            arch: 'arm64',
                            contents: [
                                {
                                    filename: 'myLS-linux-arm64.zip',
                                    url: 'https://example.com/qserver-linux-arm64.zip',
                                    hashes: ['sha384:thisisahash'],
                                    bytes: 100,
                                },
                                {
                                    filename: 'node-linux-arm64',
                                    url: 'https://example.com/temp-assets/node-linux-arm64',
                                    hashes: ['sha384:thisisanotherhash'],
                                    bytes: 200,
                                },
                            ],
                        },
                        {
                            platform: 'darwin',
                            arch: 'x64',
                            contents: [
                                {
                                    filename: 'myLS-darwin-x64.zip',
                                    url: 'https://example.com/qserver-darwin-x64.zip',
                                    hashes: ['sha384:thisisahash'],
                                    bytes: 100,
                                },
                                {
                                    filename: 'node-linux-x64',
                                    url: 'https://example.com/temp-assets/node-darwin-x64',
                                    hashes: ['sha384:thisisanotherhash'],
                                    bytes: 200,
                                },
                            ],
                        },
                        {
                            platform: 'darwin',
                            arch: 'arm64',
                            contents: [
                                {
                                    filename: 'myLS-darwin-arm64.zip',
                                    url: 'https://example.com/qserver-darwin-arm64.zip',
                                    hashes: ['sha384:thisisahash'],
                                    bytes: 100,
                                },
                                {
                                    filename: 'node-linux-arm64',
                                    url: 'https://example.com/temp-assets/node-darwin-arm64',
                                    hashes: ['sha384:thisisanotherhash'],
                                    bytes: 200,
                                },
                            ],
                        },
                        {
                            platform: 'windows',
                            arch: 'x64',
                            contents: [
                                {
                                    filename: 'myLS-windows-x64.zip',
                                    url: 'https://example.com/qserver-windows-x64.zip',
                                    hashes: ['sha384:thisisahash'],
                                    bytes: 100,
                                },
                                {
                                    filename: 'node-linux-x64',
                                    url: 'https://example.com/temp-assets/node-windows-x64',
                                    hashes: ['sha384:thisisanotherhash'],
                                    bytes: 200,
                                },
                            ],
                        },
                    ],
                },
            ],
            location: 'remote',
        }
        versionRange = new Range('>=1.0.0')
    })

    after(function () {
        sinon.restore()
    })

    it('tries local cache first', async function () {
        localStub.resolves({
            location: 'cache',
            version: '1.0.0',
            assetDirectory: 'path/to/assets',
        } satisfies LspResult)

        const r = await new LanguageServerResolver(manifest, 'myLS', versionRange).resolve()
        assert.strictEqual(r.location, 'cache')
        assertTelemetry('languageServer_setup', {
            languageServerSetupStage: 'getServer',
            id: 'myLS',
            languageServerLocation: 'cache',
            languageServerVersion: '1.0.0',
            result: 'Succeeded',
        })
    })

    it('tries fetching remote if cache fails', async function () {
        localStub.rejects(new Error('not found'))
        remoteStub.resolves({
            location: 'remote',
            version: '1.0.0',
            assetDirectory: 'path/to/assets',
        } satisfies LspResult)

        const r = await new LanguageServerResolver(manifest, 'myLS', versionRange).resolve()
        assert.strictEqual(r.location, 'remote')
        assertTelemetry('languageServer_setup', [
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'cache',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'remote',
                languageServerVersion: '1.0.0',
                result: 'Succeeded',
            },
        ])
    })

    it('tries fallback version if both remote and cache fail', async function () {
        localStub.rejects(new Error('not found'))
        remoteStub.rejects(new Error('not found'))
        fallbackStub.resolves({
            location: 'fallback',
            version: '1.0.0',
            assetDirectory: 'path/to/assets',
        } satisfies LspResult)

        const r = await new LanguageServerResolver(manifest, 'myLS', versionRange).resolve()
        assert.strictEqual(r.location, 'fallback')
        assertTelemetry('languageServer_setup', [
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'cache',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'remote',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'fallback',
                languageServerVersion: '1.0.0',
                result: 'Succeeded',
            },
        ])
    })

    it('rejects if local, remote, and fallback all reject', async function () {
        localStub.rejects(new Error('not found'))
        remoteStub.rejects(new Error('not found'))
        fallbackStub.rejects(new Error('not found'))

        await assert.rejects(new LanguageServerResolver(manifest, 'myLS', versionRange).resolve(), /not found/)
        assertTelemetry('languageServer_setup', [
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'cache',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'remote',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: 'myLS',
                languageServerLocation: 'fallback',
                result: 'Failed',
            },
        ])
    })
})
