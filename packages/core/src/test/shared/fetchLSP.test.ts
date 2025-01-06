/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { logger, LspDownloader, Manifest, Target } from '../../shared/fetchLsp'
import { RetryableResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { ToolkitError } from '../../shared/errors'

class LspDownloaderMock extends LspDownloader {
    override isLspInstalled(): Promise<boolean> {
        return Promise.resolve(true)
    }

    override latestInstalledVersion(): Promise<string | undefined> {
        return Promise.resolve('0.0.1')
    }

    override cleanup(): Promise<boolean> {
        return Promise.resolve(true)
    }

    override install(manifest: Manifest): Promise<boolean> {
        return Promise.resolve(true)
    }
}

function createManifest(params?: {
    deprecated?: boolean
    versions?: {
        serverVersion: string
        isDelisted: boolean
        targets: Target[]
    }[]
}): Manifest {
    return {
        manifestSchemaVersion: '1.0',
        artifactId: 'test',
        artifactDescription: 'test',
        isManifestDeprecated: params?.deprecated ?? false,
        versions: params?.versions ?? [],
    }
}

describe('fetchLSP', () => {
    let sandbox: sinon.SinonSandbox
    let loggerSpy: sinon.SinonSpy
    let lspDownloader: LspDownloaderMock

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        delete process.env.AWS_LANGUAGE_SERVER_OVERRIDE
        lspDownloader = new LspDownloaderMock('', 'codewhisperer')
        loggerSpy = sandbox.spy(logger, 'info')
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('tryInstallLsp', () => {
        it('overrides language server location', async () => {
            process.env.AWS_LANGUAGE_SERVER_OVERRIDE = '/custom/path'
            const result = await lspDownloader.tryInstallLsp()
            assert.strictEqual(result, true)
        })

        describe('manifest handling', () => {
            describe('downloads', () => {
                it('manifest deprecated', async () => {
                    const mock = sandbox.stub(RetryableResourceFetcher.prototype, 'getNewETagContent').resolves({
                        content: JSON.stringify(
                            createManifest({
                                deprecated: true,
                            })
                        ),
                        eTag: '',
                    })
                    const installed = await lspDownloader.tryInstallLsp()
                    assert.ok(installed)
                    assert.strictEqual(mock.calledOnce, true)
                    assert.strictEqual(
                        loggerSpy.getCall(0).firstArg,
                        'This LSP manifest is deprecated. No future updates will be available.'
                    )
                })

                it('manifest valid', async () => {
                    sandbox.stub(RetryableResourceFetcher.prototype, 'getNewETagContent').resolves({
                        content: JSON.stringify(
                            createManifest({
                                deprecated: false,
                            })
                        ),
                        eTag: '',
                    })
                    const installed = await lspDownloader.tryInstallLsp()
                    assert.ok(installed)
                })

                describe('query latest compatible version', () => {
                    it('no version found', async () => {
                        const mock = sandbox.stub(RetryableResourceFetcher.prototype, 'getNewETagContent').resolves({
                            content: JSON.stringify(
                                createManifest({
                                    deprecated: true,
                                })
                            ),
                            eTag: '',
                        })
                        const installed = await lspDownloader.tryInstallLsp()
                        assert.ok(installed)
                        assert.strictEqual(mock.calledOnce, true)
                        assert.strictEqual(
                            loggerSpy.getCall(0).firstArg,
                            'This LSP manifest is deprecated. No future updates will be available.'
                        )
                    })

                    describe('query ls for version', () => {
                        ;[
                            ['version mismatch', '0.0.2'],
                            ['already have latest version', '0.0.1'],
                            ['higher major version', '1.0.0'],
                            ['higher minor version', '0.1.0'],
                        ].forEach(([description, version]) => {
                            it(`handles ${description}`, async () => {
                                const manifest = createManifest({
                                    versions: [
                                        {
                                            serverVersion: version,
                                            isDelisted: false,
                                            targets: [],
                                        },
                                    ],
                                })
                                const installed = await lspDownloader.checkInstalledLS(manifest)
                                assert.ok(installed)
                            })
                        })
                    })
                })
            })

            it('system is offline', async () => {
                sandbox
                    .stub(RetryableResourceFetcher.prototype, 'getNewETagContent')
                    .rejects(new Error('Network error'))
                const installed = await lspDownloader.tryInstallLsp()
                assert.strictEqual(installed, false)
                assert.ok(
                    loggerSpy.calledWith(
                        'Failed to setup LSP server: Failed to download LSP manifest and no local manifest found.'
                    )
                )
            })

            it('download and installs', async () => {
                const manifest = createManifest({
                    versions: [
                        {
                            serverVersion: '0.0.2',
                            isDelisted: false,
                            targets: [],
                        },
                    ],
                })

                const installSpy = sandbox.spy(lspDownloader, 'install')
                const installed = await lspDownloader.checkInstalledLS(manifest)
                assert.ok(installed)
                assert.strictEqual(installSpy.callCount, 1)
            })
        })
    })

    describe('fallbackToLocalVersion', () => {
        describe('local version is installed', () => {
            it('manifest is not found', async () => {
                await assert.doesNotReject(async () => {
                    const installed = await lspDownloader.fallbackToLocalVersion()
                    assert.ok(installed)
                })
            })

            it('version is delisted', async () => {
                await assert.rejects(async () => {
                    const installed = await lspDownloader.fallbackToLocalVersion(
                        createManifest({
                            versions: [
                                {
                                    serverVersion: '0.0.1',
                                    isDelisted: true,
                                    targets: [],
                                },
                            ],
                        })
                    )
                    assert.ok(installed)
                }, new ToolkitError('Local LSP version is delisted. Please update to a newer version.'))
            })

            it('version is valid', async () => {
                await assert.doesNotReject(async () => {
                    const installed = await lspDownloader.fallbackToLocalVersion(
                        createManifest({
                            versions: [
                                {
                                    serverVersion: '0.0.1',
                                    isDelisted: false,
                                    targets: [],
                                },
                            ],
                        })
                    )
                    assert.ok(installed)
                })
            })

            it('version not found', async () => {
                await assert.doesNotReject(async () => {
                    const installed = await lspDownloader.fallbackToLocalVersion(
                        createManifest({
                            versions: [],
                        })
                    )
                    assert.ok(installed)
                })
            })
        })

        it('local version is not installed', async () => {
            sandbox.stub(lspDownloader, 'isLspInstalled').returns(Promise.resolve(false))
            await assert.rejects(
                async () => {
                    const installed = await lspDownloader.fallbackToLocalVersion(createManifest())
                    assert.ok(installed)
                },
                new ToolkitError('No compatible local LSP version found', { code: 'LSPNotInstalled' })
            )
        })
    })

    describe('checkInstalledLS', () => {
        let installSpy: sinon.SinonSpy

        beforeEach(() => {
            installSpy = sandbox.spy(lspDownloader, 'install')
        })

        it('language server was not previously downloaded', async () => {
            await assert.doesNotReject(async () => {
                const installed = await lspDownloader.checkInstalledLS(createManifest())
                assert.ok(installed)
            })
            assert.deepStrictEqual(installSpy.callCount, 1)
        })

        describe('language server was downloaded', () => {
            it('could not check the latest installed version', async () => {
                sandbox.stub(lspDownloader, 'latestInstalledVersion').returns(Promise.reject(new Error('foo')))
                await assert.doesNotReject(async () => {
                    const installed = await lspDownloader.checkInstalledLS(createManifest())
                    assert.ok(installed)
                })
                assert.strictEqual(
                    loggerSpy.getCall(0).firstArg,
                    'Failed to query language server for installed version'
                )
                assert.deepStrictEqual(installSpy.callCount, 1)
            })

            describe('found the latest installed version', () => {
                it('version mismatch', async () => {
                    sandbox.stub(lspDownloader, 'latestInstalledVersion').returns(Promise.resolve('0.0.0'))
                    await assert.doesNotReject(async () => {
                        const installed = await lspDownloader.checkInstalledLS(createManifest())
                        assert.ok(installed)
                    })
                    assert.deepStrictEqual(installSpy.callCount, 1)
                })

                it('version match', async () => {
                    sandbox.stub(lspDownloader, 'latestInstalledVersion').returns(Promise.resolve('0.0.1'))
                    await assert.doesNotReject(async () => {
                        const installed = await lspDownloader.checkInstalledLS(
                            createManifest({
                                versions: [
                                    {
                                        serverVersion: '0.0.1',
                                        isDelisted: false,
                                        targets: [],
                                    },
                                ],
                            })
                        )
                        assert.ok(installed)
                    })

                    assert.deepStrictEqual(installSpy.callCount, 0)
                })
            })
        })
    })
})
