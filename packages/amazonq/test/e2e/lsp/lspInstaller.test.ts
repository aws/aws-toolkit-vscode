/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { AmazonQLSPResolver, manifestURL, supportedLspServerVersions } from '../../../src/lsp/lspInstaller'
import {
    fs,
    globals,
    LanguageServerResolver,
    makeTemporaryToolkitFolder,
    ManifestResolver,
    manifestStorageKey,
    request,
} from 'aws-core-vscode/shared'
import * as semver from 'semver'
import { assertTelemetry } from 'aws-core-vscode/test'
import { LspController } from 'aws-core-vscode/amazonq'
import { LanguageServerSetup } from 'aws-core-vscode/telemetry'

function createVersion(version: string) {
    return {
        isDelisted: false,
        serverVersion: version,
        targets: [
            {
                arch: process.arch,
                platform: process.platform,
                contents: [
                    {
                        bytes: 0,
                        filename: 'servers.zip',
                        hashes: [],
                        url: 'http://fakeurl',
                    },
                ],
            },
        ],
    }
}

describe('AmazonQLSPInstaller', () => {
    let resolver: AmazonQLSPResolver
    let sandbox: sinon.SinonSandbox
    let tempDir: string
    // If globalState contains an ETag that is up to date with remote, we won't fetch it resulting in inconsistent behavior.
    // Therefore, we clear it temporarily for these tests to ensure consistent behavior.
    let manifestStorage: { [key: string]: any }

    before(async () => {
        manifestStorage = globals.globalState.get(manifestStorageKey) || {}
    })

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        resolver = new AmazonQLSPResolver()
        tempDir = await makeTemporaryToolkitFolder()
        sandbox.stub(LanguageServerResolver.prototype, 'defaultDownloadFolder').returns(tempDir)
        // Called on extension activation and can contaminate telemetry.
        sandbox.stub(LspController.prototype, 'trySetupLsp')
        await globals.globalState.update(manifestStorageKey, {})
    })

    afterEach(async () => {
        delete process.env.AWS_LANGUAGE_SERVER_OVERRIDE
        sandbox.restore()
        await fs.delete(tempDir, {
            recursive: true,
        })
    })

    after(async () => {
        await globals.globalState.update(manifestStorageKey, manifestStorage)
    })

    describe('resolve()', () => {
        it('uses AWS_LANGUAGE_SERVER_OVERRIDE', async () => {
            const overridePath = '/custom/path/to/lsp'
            process.env.AWS_LANGUAGE_SERVER_OVERRIDE = overridePath

            const result = await resolver.resolve()

            assert.strictEqual(result.assetDirectory, overridePath)
            assert.strictEqual(result.location, 'override')
            assert.strictEqual(result.version, '0.0.0')
        })

        it('resolves', async () => {
            // First try - should download the file
            const download = await resolver.resolve()

            assert.ok(download.assetDirectory.startsWith(tempDir))
            assert.deepStrictEqual(download.location, 'remote')
            assert.ok(semver.satisfies(download.version, supportedLspServerVersions))

            // Second try - Should see the contents in the cache
            const cache = await resolver.resolve()

            assert.ok(cache.assetDirectory.startsWith(tempDir))
            assert.deepStrictEqual(cache.location, 'cache')
            assert.ok(semver.satisfies(cache.version, supportedLspServerVersions))

            /**
             * Always make sure the latest version is one patch higher. This stops a problem
             * where the fallback can't be used because the latest compatible version
             * is equal to the min version, so if the cache isn't valid, then there
             * would be no fallback location
             *
             * Instead, increasing the latest compatible lsp version means we can just
             * use the one we downloaded earlier in the test as the fallback
             */
            const nextVer = semver.inc(cache.version, 'patch', true)
            if (!nextVer) {
                throw new Error('Could not increment version')
            }
            sandbox.stub(ManifestResolver.prototype, 'resolve').resolves({
                manifestSchemaVersion: '0.0.0',
                artifactId: 'foo',
                artifactDescription: 'foo',
                isManifestDeprecated: false,
                versions: [createVersion(nextVer), createVersion(cache.version)],
            })

            // fail the next http request for the language server
            sandbox.stub(request, 'fetch').returns({
                response: Promise.resolve({
                    ok: false,
                }),
            } as any)

            // Third try - Cache doesn't exist and we couldn't download from the internet, fallback to a local version
            const fallback = await resolver.resolve()

            assert.ok(fallback.assetDirectory.startsWith(tempDir))
            assert.deepStrictEqual(fallback.location, 'fallback')
            assert.ok(semver.satisfies(fallback.version, supportedLspServerVersions))

            /* First Try Telemetry
                    getManifest: remote succeeds
                    getServer: cache fails then remote succeeds.
                    validate: succeeds.
            */
            const firstTryTelemetry: Partial<LanguageServerSetup>[] = [
                {
                    id: 'AmazonQ',
                    manifestLocation: 'remote',
                    languageServerSetupStage: 'getManifest',
                    result: 'Succeeded',
                },
                {
                    id: 'AmazonQ',
                    languageServerLocation: 'cache',
                    languageServerSetupStage: 'getServer',
                    result: 'Failed',
                },
                {
                    id: 'AmazonQ',
                    languageServerLocation: 'remote',
                    languageServerSetupStage: 'validate',
                    result: 'Succeeded',
                },
                {
                    id: 'AmazonQ',
                    languageServerLocation: 'remote',
                    languageServerSetupStage: 'getServer',
                    result: 'Succeeded',
                },
            ]

            /* Second Try Telemetry
                    getManifest: remote fails, then cache succeeds.
                    getServer: cache succeeds
                    validate: doesn't run since its cached.
            */
            const secondTryTelemetry: Partial<LanguageServerSetup>[] = [
                {
                    id: 'AmazonQ',
                    manifestLocation: 'remote',
                    languageServerSetupStage: 'getManifest',
                    result: 'Failed',
                },
                {
                    id: 'AmazonQ',
                    manifestLocation: 'cache',
                    languageServerSetupStage: 'getManifest',
                    result: 'Succeeded',
                },
                {
                    id: 'AmazonQ',
                    languageServerLocation: 'cache',
                    languageServerSetupStage: 'getServer',
                    result: 'Succeeded',
                },
            ]

            /* Third Try Telemetry
                    getManifest: (stubbed to fail, no telemetry)
                    getServer: remote and cache fail
                    validate: no validation since not remote. 
            */
            const thirdTryTelemetry: Partial<LanguageServerSetup>[] = [
                {
                    id: 'AmazonQ',
                    languageServerLocation: 'cache',
                    languageServerSetupStage: 'getServer',
                    result: 'Failed',
                },
                {
                    id: 'AmazonQ',
                    languageServerLocation: 'remote',
                    languageServerSetupStage: 'getServer',
                    result: 'Failed',
                },
                {
                    id: 'AmazonQ',
                    languageServerLocation: 'fallback',
                    languageServerSetupStage: 'getServer',
                    result: 'Succeeded',
                },
            ]

            const expectedTelemetry = firstTryTelemetry.concat(secondTryTelemetry, thirdTryTelemetry)

            assertTelemetry('languageServer_setup', expectedTelemetry)
        })

        it('resolves release candidiates', async () => {
            const original = new ManifestResolver(manifestURL, 'AmazonQ').resolve()
            sandbox.stub(ManifestResolver.prototype, 'resolve').callsFake(async () => {
                const originalManifest = await original

                const latestVersion = originalManifest.versions.reduce((latest, current) => {
                    return semver.gt(current.serverVersion, latest.serverVersion) ? current : latest
                }, originalManifest.versions[0])

                // These convert something like 3.1.1 to 3.2.1-rc.0
                const incrementedVersion = semver.inc(latestVersion.serverVersion, 'minor')
                if (!incrementedVersion) {
                    assert.fail('Failed to increment minor version')
                }

                const prereleaseVersion = semver.inc(incrementedVersion, 'prerelease', 'rc')
                if (!prereleaseVersion) {
                    assert.fail('Failed to create pre-release version')
                }

                const newVersion = {
                    ...latestVersion,
                    serverVersion: prereleaseVersion,
                }

                originalManifest.versions = [newVersion, ...originalManifest.versions]
                return originalManifest
            })

            const download = await resolver.resolve()
            assert.ok(download.assetDirectory.endsWith('-rc.0'))
        })
    })
})
