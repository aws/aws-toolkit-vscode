/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { LanguageServerResolver } from '../../../shared/languageServer/lspResolver'
import { fs, makeTemporaryToolkitFolder, Manifest, Target } from '../../../shared'
import { Range } from 'semver'
import { RetryableResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'

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

describe('lspManager', () => {
    let sandbox: sinon.SinonSandbox
    let tempFolder: string

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async () => {
        sandbox.restore()
        await fs.delete(tempFolder)
    })

    describe('download', () => {
        it('uses local cache', async () => {
            const manifest = createManifest({
                versions: [
                    {
                        isDelisted: false,
                        serverVersion: '2.0.0',
                        targets: [
                            {
                                arch: process.arch,
                                platform: process.platform,
                                contents: [
                                    {
                                        filename: '',
                                        url: '',
                                        hashes: [''],
                                        bytes: 0,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })
            const manager = new LanguageServerResolver(manifest, 'test', new Range('2.0.0'), tempFolder)
            const result = await manager.resolve()
            assert.deepStrictEqual(result, {
                assetDirectory: manager.getDownloadDirectory('2.0.0'),
                version: '2.0.0',
                location: 'cache',
            })
        })

        it('uses remote', async () => {
            sandbox.stub(RetryableResourceFetcher.prototype, 'fetch').resolves({
                content: '',
                eTag: '',
            })

            const manifest = createManifest({
                versions: [
                    {
                        isDelisted: false,
                        serverVersion: '2.0.0',
                        targets: [
                            {
                                arch: process.arch,
                                platform: process.platform,
                                contents: [
                                    {
                                        filename: 'test.zip',
                                        url: '',
                                        hashes: [''],
                                        bytes: 0,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })

            const manager = new LanguageServerResolver(manifest, 'test', new Range('2.0.0'), tempFolder)
            const result = await manager.resolve()
            assert.deepStrictEqual(result, {
                assetDirectory: manager.getDownloadDirectory('2.0.0'),
                version: '2.0.0',
                location: 'remote',
            })
        })

        it('uses fallback directory', async () => {
            const manifest = createManifest({
                versions: [
                    {
                        isDelisted: false,
                        serverVersion: '2.0.0',
                        targets: [
                            {
                                arch: process.arch,
                                platform: process.platform,
                                contents: [
                                    {
                                        filename: 'test.zip',
                                        url: 'http://fakeurl',
                                        hashes: [''],
                                        bytes: 0,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })

            const manager = new LanguageServerResolver(manifest, 'test', new Range('2.0.0'), tempFolder)
            const result = await manager.resolve()
            assert.deepStrictEqual(result, {
                assetDirectory: manager.getDownloadDirectory('2.0.0'),
                version: '2.0.0',
                location: 'remote',
            })
        })
    })
})
