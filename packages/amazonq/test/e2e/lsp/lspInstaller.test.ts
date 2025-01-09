/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { AmazonQLSPResolver, supportedLspServerVersions } from '../../../src/lsp/lspInstaller'
import {
    fs,
    LanguageServerResolver,
    makeTemporaryToolkitFolder,
    ManifestResolver,
    request,
} from 'aws-core-vscode/shared'
import * as semver from 'semver'

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

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        resolver = new AmazonQLSPResolver()
        tempDir = await makeTemporaryToolkitFolder()
        sandbox.stub(LanguageServerResolver.prototype, 'defaultDownloadFolder').returns(tempDir)
    })

    afterEach(async () => {
        delete process.env.AWS_LANGUAGE_SERVER_OVERRIDE
        sandbox.restore()
        await fs.delete(tempDir, {
            recursive: true,
        })
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
        })
    })
})
