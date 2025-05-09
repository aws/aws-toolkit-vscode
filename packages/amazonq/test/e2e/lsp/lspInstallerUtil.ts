/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import {
    BaseLspInstaller,
    DevSettings,
    fs,
    LanguageServerResolver,
    makeTemporaryToolkitFolder,
    ManifestResolver,
    request,
    TargetContent,
    ToolkitError,
} from 'aws-core-vscode/shared'
import * as semver from 'semver'
import { assertTelemetry } from 'aws-core-vscode/test'
import { LspConfig } from 'aws-core-vscode/amazonq'
import { LanguageServerSetup } from 'aws-core-vscode/telemetry'

function createVersion(version: string, contents: TargetContent[]) {
    return {
        isDelisted: false,
        serverVersion: version,
        targets: [
            {
                arch: process.arch,
                platform: process.platform,
                contents,
            },
        ],
    }
}

export function createLspInstallerTests({
    suiteName,
    lspConfig,
    createInstaller,
    targetContents,
    setEnv,
    resetEnv,
}: {
    suiteName: string
    lspConfig: LspConfig
    createInstaller: (lspConfig?: LspConfig) => BaseLspInstaller.BaseLspInstaller
    targetContents: TargetContent[]
    setEnv: (path: string) => void
    resetEnv: () => void
}) {
    describe(suiteName, () => {
        let installer: BaseLspInstaller.BaseLspInstaller
        let sandbox: sinon.SinonSandbox
        let tempDir: string

        beforeEach(async () => {
            sandbox = sinon.createSandbox()
            installer = createInstaller()
            tempDir = await makeTemporaryToolkitFolder()
            sandbox.stub(LanguageServerResolver.prototype, 'defaultDownloadFolder').returns(tempDir)
        })

        afterEach(async () => {
            resetEnv()
            sandbox.restore()
            await fs.delete(tempDir, {
                recursive: true,
            })
        })

        describe('resolve()', () => {
            it('uses dev setting override', async () => {
                const path = '/custom/path/to/lsp'
                sandbox.stub(DevSettings.instance, 'getServiceConfig').returns({
                    path,
                })
                /**
                 * The installer pre-evaluates the config, so if we want to override the config
                 * we need to stub then re-create it
                 */
                const result = await createInstaller().resolve()

                assert.strictEqual(result.assetDirectory, path)
                assert.strictEqual(result.location, 'override')
                assert.strictEqual(result.version, '0.0.0')
            })

            it('uses environment variable override', async () => {
                const overridePath = '/custom/path/to/lsp'
                setEnv(overridePath)

                /**
                 * The installer pre-evaluates the config, so if we want to override the environment variables
                 * we need to override the env then re-create it
                 */
                const result = await createInstaller().resolve()

                assert.strictEqual(result.assetDirectory, overridePath)
                assert.strictEqual(result.location, 'override')
                assert.strictEqual(result.version, '0.0.0')
            })

            it('resolves', async () => {
                // First try - should download the file
                const download = await installer.resolve()

                assert.ok(download.assetDirectory.startsWith(tempDir))
                assert.deepStrictEqual(download.location, 'remote')
                assert.ok(semver.satisfies(download.version, lspConfig.supportedVersions))

                // Second try - Should see the contents in the cache
                const cache = await installer.resolve()

                assert.ok(cache.assetDirectory.startsWith(tempDir))
                assert.deepStrictEqual(cache.location, 'cache')
                assert.ok(semver.satisfies(cache.version, lspConfig.supportedVersions))

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
                    versions: [createVersion(nextVer, targetContents), createVersion(cache.version, targetContents)],
                })

                // fail the next http request for the language server
                sandbox.stub(request, 'fetch').returns({
                    response: Promise.resolve({
                        ok: false,
                    }),
                } as any)

                const config = {
                    ...lspConfig,
                    // contains the old version thats actually on disk + the new version
                    supportedVersions: `${cache.version} || ${nextVer}`,
                }

                // Third try - Cache doesn't exist and we couldn't download from the internet, fallback to a local version
                const fallback = await createInstaller(config).resolve()

                assert.ok(fallback.assetDirectory.startsWith(tempDir))
                assert.deepStrictEqual(fallback.location, 'fallback')
                assert.ok(semver.satisfies(fallback.version, lspConfig.supportedVersions))

                /* First Try Telemetry
                        getManifest: remote succeeds
                        getServer: cache fails then remote succeeds.
                        validate: succeeds.
                */
                const firstTryTelemetry: Partial<LanguageServerSetup>[] = [
                    {
                        id: lspConfig.id,
                        manifestLocation: 'remote',
                        languageServerSetupStage: 'getManifest',
                        result: 'Succeeded',
                    },
                    {
                        id: lspConfig.id,
                        languageServerLocation: 'cache',
                        languageServerSetupStage: 'getServer',
                        result: 'Failed',
                    },
                    {
                        id: lspConfig.id,
                        languageServerLocation: 'remote',
                        languageServerSetupStage: 'validate',
                        result: 'Succeeded',
                    },
                    {
                        id: lspConfig.id,
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
                        id: lspConfig.id,
                        manifestLocation: 'remote',
                        languageServerSetupStage: 'getManifest',
                        result: 'Succeeded',
                    },
                    {
                        id: lspConfig.id,
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
                        id: lspConfig.id,
                        languageServerLocation: 'cache',
                        languageServerSetupStage: 'getServer',
                        result: 'Failed',
                    },
                    {
                        id: lspConfig.id,
                        languageServerLocation: 'remote',
                        languageServerSetupStage: 'getServer',
                        result: 'Failed',
                    },
                    {
                        id: lspConfig.id,
                        languageServerLocation: 'fallback',
                        languageServerSetupStage: 'getServer',
                        result: 'Succeeded',
                    },
                ]

                const expectedTelemetry = firstTryTelemetry.concat(secondTryTelemetry, thirdTryTelemetry)

                assertTelemetry('languageServer_setup', expectedTelemetry)
            })

            it('resolves release candidiates', async () => {
                const original = new ManifestResolver(lspConfig.manifestUrl, lspConfig.id, '').resolve()
                sandbox.stub(ManifestResolver.prototype, 'resolve').callsFake(async () => {
                    const originalManifest = await original

                    const latestVersion = originalManifest.versions.reduce((latest, current) => {
                        return semver.gt(current.serverVersion, latest.serverVersion) ? current : latest
                    }, originalManifest.versions[0])

                    // These convert something like 3.1.1 to 3.1.2-rc.0
                    const incrementedVersion = semver.inc(latestVersion.serverVersion, 'patch')
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

                const version = lspConfig.supportedVersions
                lspConfig.supportedVersions = version.startsWith('^') ? version : `^${version}`
                const download = await createInstaller(lspConfig).resolve()
                assert.ok(download.assetDirectory.endsWith('-rc.0'))
            })

            it('throws on firewall error', async () => {
                // Stub the manifest resolver to return a valid manifest
                sandbox.stub(ManifestResolver.prototype, 'resolve').resolves({
                    manifestSchemaVersion: '0.0.0',
                    artifactId: 'foo',
                    artifactDescription: 'foo',
                    isManifestDeprecated: false,
                    versions: [createVersion('1.0.0', targetContents)],
                })

                // Fail all HTTP requests for the language server
                sandbox.stub(request, 'fetch').returns({
                    response: Promise.resolve({
                        ok: false,
                    }),
                } as any)

                // This should now throw a NetworkConnectivityError
                await assert.rejects(
                    async () => await installer.resolve(),
                    (err: ToolkitError) => {
                        assert.strictEqual(err.code, 'NetworkConnectivityError')
                        assert.ok(err.message.includes('Unable to download dependencies'))
                        return true
                    }
                )
            })
        })
    })
}
