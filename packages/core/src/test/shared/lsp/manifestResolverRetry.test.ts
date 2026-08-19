/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as path from 'path'
import { ManifestResolver, ManifestResolverConfig, ManifestAdapter } from '../../../shared/lsp/manifestResolver'
import { fs } from '../../../shared/fs/fs'
import { Manifest } from '../../../shared/lsp/types'
import { AmazonQPromptSettings } from '../../../shared/settings'
import { validManifestJson, channelKeyedManifestJson, deprecatedManifestJson } from './lspTestFixtures'

describe('ManifestResolver - retry, atomic save, and adapter', function () {
    let sandbox: sinon.SinonSandbox
    let existsFileStub: sinon.SinonStub
    let readFileTextStub: sinon.SinonStub
    let mkdirStub: sinon.SinonStub
    let writeFileStub: sinon.SinonStub
    let renameStub: sinon.SinonStub
    let deleteStub: sinon.SinonStub

    const validManifest = validManifestJson

    function makeConfig(overrides?: Partial<ManifestResolverConfig>): ManifestResolverConfig {
        return {
            manifestUrl: 'https://example.com/manifest.json',
            lsName: 'test-lsp',
            cacheDir: '/tmp/test-cache/test-lsp',
            fetchFn: undefined as any,
            sleepFn: async () => {}, // no-op sleep: no real delays in tests
            ...overrides,
        }
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        existsFileStub = sandbox.stub(fs, 'existsFile')
        readFileTextStub = sandbox.stub(fs, 'readFileText')
        mkdirStub = sandbox.stub(fs, 'mkdir').resolves()
        writeFileStub = sandbox.stub(fs, 'writeFile').resolves()
        renameStub = sandbox.stub(fs, 'rename').resolves()
        deleteStub = sandbox.stub(fs, 'delete').resolves()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('remote fetch with exactly 3 retries', function () {
        it('succeeds on first attempt', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(validManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'remote')
            assert.strictEqual(result.manifestSchemaVersion, '1.0')
            assert.strictEqual(fetchFn.callCount, 1)
            assert.strictEqual(sleepFn.callCount, 0)
        })

        it('retries exactly 3 times before falling to cache', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(false)

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            await assert.rejects(resolver.resolve(), /Cached .* manifest not found/)

            assert.strictEqual(fetchFn.callCount, 3)
            // Sleep called between attempts 1->2 and 2->3 = 2 times
            assert.strictEqual(sleepFn.callCount, 2)
        })

        it('uses exponential backoff delays', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(false)

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            await assert.rejects(resolver.resolve())

            // backoff: 1000ms * 2^0 = 1000, 1000ms * 2^1 = 2000
            assert.strictEqual(sleepFn.getCall(0).args[0], 1000)
            assert.strictEqual(sleepFn.getCall(1).args[0], 2000)
        })

        it('succeeds on second attempt after first fails', async function () {
            const fetchFn = sandbox
                .stub()
                .onFirstCall()
                .rejects(new Error('temporary error'))
                .onSecondCall()
                .resolves(new Response(validManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'remote')
            assert.strictEqual(fetchFn.callCount, 2)
            assert.strictEqual(sleepFn.callCount, 1)
        })

        it('succeeds on third attempt', async function () {
            const fetchFn = sandbox
                .stub()
                .onFirstCall()
                .rejects(new Error('error 1'))
                .onSecondCall()
                .rejects(new Error('error 2'))
                .onThirdCall()
                .resolves(new Response(validManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'remote')
            assert.strictEqual(fetchFn.callCount, 3)
        })

        it('treats HTTP error responses as failures and retries', async function () {
            const fetchFn = sandbox.stub().resolves(new Response('Not Found', { status: 404, statusText: 'Not Found' }))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(false)

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            await assert.rejects(resolver.resolve(), /Cached .* manifest not found/)

            assert.strictEqual(fetchFn.callCount, 3)
        })
    })

    describe('atomic manifest save (temp + rename)', function () {
        it('writes to temp file then renames to manifest.json', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(validManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            await resolver.resolve()

            sinon.assert.calledOnce(mkdirStub)
            sinon.assert.calledWith(mkdirStub, '/tmp/test-cache/test-lsp')

            // writeFile should be called with a .tmp suffix path
            sinon.assert.calledOnce(writeFileStub)
            const writePath = writeFileStub.getCall(0).args[0] as string
            assert.ok(writePath.endsWith('.tmp'), `Expected temp file path, got: ${writePath}`)
            assert.ok(writePath.includes('/tmp/test-cache/test-lsp/manifest.json.'))
            assert.strictEqual(writeFileStub.getCall(0).args[1], validManifest)

            // rename should be called from temp to final
            sinon.assert.calledOnce(renameStub)
            const [oldPath, newPath] = renameStub.getCall(0).args
            assert.ok((oldPath as string).endsWith('.tmp'))
            assert.strictEqual(newPath, path.join('/tmp/test-cache/test-lsp', 'manifest.json'))
        })

        it('cleans up temp file if rename fails', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(validManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()
            renameStub.rejects(new Error('rename failed'))
            existsFileStub.resolves(true) // temp file exists for cleanup

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            // Should still resolve successfully (manifest parsed in memory)
            const result = await resolver.resolve()
            assert.strictEqual(result.location, 'remote')

            // delete should be called for temp file cleanup
            sinon.assert.called(deleteStub)
        })
    })

    describe('adapter hook for channel-keyed manifests', function () {
        const channelKeyedManifest = channelKeyedManifestJson

        /** Creates a ManifestAdapter that selects the given channel from a channel-keyed manifest. */
        function channelAdapter(channel: string): ManifestAdapter {
            return {
                adapt(raw: unknown): Manifest {
                    const obj = raw as Record<string, unknown>
                    return {
                        manifestSchemaVersion: obj.manifestSchemaVersion as string,
                        artifactId: obj.artifactId as string,
                        artifactDescription: obj.artifactDescription as string,
                        isManifestDeprecated: obj.isManifestDeprecated as boolean,
                        versions: obj[channel] as Manifest['versions'],
                    }
                },
            }
        }

        it('applies adapter to transform channel-keyed manifest', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(channelKeyedManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const adapter = channelAdapter('alpha')

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn, adapter }))
            const result = await resolver.resolve()

            assert.strictEqual(result.versions.length, 2)
            assert.strictEqual(result.versions[0].serverVersion, '1.0.0-alpha')
            assert.strictEqual(result.manifestSchemaVersion, '2.0')
        })

        it('applies adapter to cached manifest on fallback', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(true)
            readFileTextStub.resolves(channelKeyedManifest)

            const adapter = channelAdapter('prod')

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn, adapter }))
            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'cache')
            assert.strictEqual(result.versions.length, 1)
            assert.strictEqual(result.versions[0].serverVersion, '1.0.0')
        })

        it('works without adapter (raw JSON parsed directly as Manifest)', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(validManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            const result = await resolver.resolve()

            assert.strictEqual(result.manifestSchemaVersion, '1.0')
            assert.deepStrictEqual(result.versions, [])
        })

        it('rejects channel-keyed JSON without a concrete adapter', function () {
            const resolver = new ManifestResolver(makeConfig())

            assert.throws(() => (resolver as any).parseAndAdapt(channelKeyedManifest), /top-level 'versions' array/)
        })
    })

    describe('filesystem cache fallback', function () {
        it('falls back to cached manifest when remote fails', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(true)
            readFileTextStub.resolves(validManifest)

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'cache')
        })

        it('fails when both remote and cache are unavailable', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(false)

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            await assert.rejects(resolver.resolve())
        })

        it('fails when cached manifest is empty', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(true)
            readFileTextStub.resolves('')

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            await assert.rejects(resolver.resolve(), /empty/)
        })

        it('fails when cached manifest is invalid JSON', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(true)
            readFileTextStub.resolves('not valid json')

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            await assert.rejects(resolver.resolve(), /parse/)
        })
    })

    describe('legacy constructor', function () {
        it('computes cacheDir from platform cache', async function () {
            // Stub global fetch for legacy constructor
            sandbox.stub(globalThis, 'fetch').resolves(new Response(validManifest, { status: 200 }))

            const resolver = new ManifestResolver('https://example.com/manifest.json', 'my-server', 'myPrefix')
            await resolver.resolve()

            // Verify it wrote to a path containing the server name
            const writeCall = writeFileStub.getCall(0)
            assert.ok(writeCall.args[0].includes('my-server'))
            assert.ok(writeCall.args[0].includes('manifest.json'))
        })
    })

    describe('deprecation check', function () {
        const deprecatedManifest = deprecatedManifestJson

        it('logs deprecation warning with suppressPrefix when manifest is deprecated (remote)', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(deprecatedManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn, suppressPrefix: 'cfn' }))
            const result = await resolver.resolve()

            // Should still resolve successfully
            assert.strictEqual(result.isManifestDeprecated, true)
            assert.strictEqual(result.location, 'remote')
        })

        it('logs deprecation warning without suppressPrefix when no prefix configured', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(deprecatedManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn }))
            const result = await resolver.resolve()

            // Should still resolve successfully
            assert.strictEqual(result.isManifestDeprecated, true)
        })

        it('checks deprecation on cached manifest too', async function () {
            const fetchFn = sandbox.stub().rejects(new Error('network error'))
            const sleepFn = sandbox.stub().resolves()
            existsFileStub.resolves(true)
            readFileTextStub.resolves(deprecatedManifest)

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn, suppressPrefix: 'cfn' }))
            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'cache')
            assert.strictEqual(result.isManifestDeprecated, true)
        })

        it('re-enables the registered prompt when the manifest is active again', async function () {
            const enablePrompt = sandbox.stub().resolves()
            sandbox.stub(AmazonQPromptSettings, 'instance').get(
                () =>
                    ({
                        enablePrompt,
                        disablePrompt: sandbox.stub().resolves(),
                        isPromptEnabled: sandbox.stub().returns(false),
                    }) as unknown as AmazonQPromptSettings
            )
            const fetchFn = sandbox.stub().resolves(new Response(validManifest, { status: 200 }))

            await new ManifestResolver(
                makeConfig({ fetchFn, suppressPrefix: 'amazonQ', sleepFn: sandbox.stub().resolves() })
            ).resolve()

            sinon.assert.calledOnceWithExactly(enablePrompt, 'amazonQLspManifestMessage')
        })

        it('does not warn when manifest is not deprecated', async function () {
            const fetchFn = sandbox.stub().resolves(new Response(validManifest, { status: 200 }))
            const sleepFn = sandbox.stub().resolves()

            const resolver = new ManifestResolver(makeConfig({ fetchFn, sleepFn, suppressPrefix: 'cfn' }))
            const result = await resolver.resolve()

            assert.strictEqual(result.isManifestDeprecated, false)
        })

        it('preserves legacy constructor suppressPrefix behavior', async function () {
            sandbox.stub(globalThis, 'fetch').resolves(new Response(deprecatedManifest, { status: 200 }))

            const resolver = new ManifestResolver('https://example.com/manifest.json', 'my-server', 'myPrefix')
            const result = await resolver.resolve()

            assert.strictEqual(result.isManifestDeprecated, true)
        })
    })
})
