/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { LanguageServerResolver, LspResult, Manifest, Target } from '../../../shared'
import { Range } from 'semver'
import { assertTelemetry } from '../../testUtil'
import { LanguageServerLocation } from '../../../shared/telemetry'

const serverVersion = '1.0.0'
const assetDirectory = 'path/to/assets'
const serverName = 'myLS'

/**
 * Helper function for generating valid manifest for tests.
 * @param platform
 * @param arch
 * @returns
 */
function manifestTarget(platform: 'linux' | 'darwin' | 'windows', arch: 'x64' | 'arm64'): Target {
    return {
        platform,
        arch,
        contents: [
            {
                filename: `${serverName}-${platform}-${arch}.zip`,
                url: `https://example.com/lsp-${platform}-${arch}.zip`,
                hashes: ['sha384:thisisahash'],
                bytes: 100,
            },
            {
                filename: `node-${platform}-${arch}`,
                url: `https://example.com/temp-assets/node-${platform}-${arch}`,
                hashes: ['sha384:thisisanotherhash'],
                bytes: 200,
            },
        ],
    }
}
/**
 * Helper function for generating valid LspResult for tests.
 * @param location
 * @returns
 */
function lspResult(location: LanguageServerLocation): LspResult {
    return {
        location,
        version: serverVersion,
        assetDirectory: assetDirectory,
    }
}

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
            manifestSchemaVersion: '2.0.0',
            artifactId: 'artifact-id',
            artifactDescription: 'artifact-description',
            isManifestDeprecated: false,
            versions: [
                {
                    serverVersion: serverVersion,
                    isDelisted: false,
                    targets: [
                        manifestTarget('linux', 'x64'),
                        manifestTarget('linux', 'arm64'),
                        manifestTarget('darwin', 'x64'),
                        manifestTarget('darwin', 'arm64'),
                        manifestTarget('windows', 'x64'),
                    ],
                },
            ],
        }
        versionRange = new Range(`>=${serverVersion}`)
    })

    after(function () {
        sinon.restore()
    })

    it('tries local cache first', async function () {
        localStub.resolves(lspResult('cache'))

        const r = await new LanguageServerResolver(manifest, serverName, versionRange).resolve()
        assert.strictEqual(r.location, 'cache')
        assertTelemetry('languageServer_setup', {
            languageServerSetupStage: 'getServer',
            id: serverName,
            languageServerLocation: 'cache',
            languageServerVersion: serverVersion,
            result: 'Succeeded',
        })
    })

    it('tries fetching remote if cache fails', async function () {
        localStub.rejects(new Error('not found'))
        remoteStub.resolves(lspResult('remote'))

        const r = await new LanguageServerResolver(manifest, serverName, versionRange).resolve()
        assert.strictEqual(r.location, 'remote')
        assertTelemetry('languageServer_setup', [
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'cache',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'remote',
                languageServerVersion: serverVersion,
                result: 'Succeeded',
            },
        ])
    })

    it('tries fallback version if both remote and cache fail', async function () {
        localStub.rejects(new Error('not found'))
        remoteStub.rejects(new Error('not found'))
        fallbackStub.resolves(lspResult('fallback'))

        const r = await new LanguageServerResolver(manifest, serverName, versionRange).resolve()
        assert.strictEqual(r.location, 'fallback')
        assertTelemetry('languageServer_setup', [
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'cache',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'remote',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'fallback',
                languageServerVersion: serverVersion,
                result: 'Succeeded',
            },
        ])
    })

    it('rejects if local, remote, and fallback all reject', async function () {
        localStub.rejects(new Error('not found'))
        remoteStub.rejects(new Error('not found'))
        fallbackStub.rejects(new Error('not found'))

        await assert.rejects(new LanguageServerResolver(manifest, serverName, versionRange).resolve(), /not found/)
        assertTelemetry('languageServer_setup', [
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'cache',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'remote',
                result: 'Failed',
            },
            {
                languageServerSetupStage: 'getServer',
                id: serverName,
                languageServerLocation: 'fallback',
                result: 'Failed',
            },
        ])
    })
})
