/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { LspManager, Manifest, Target } from '../../../shared/languageServer/lspManager'
import { fs, makeTemporaryToolkitFolder } from '../../../shared'
import * as download from '../../../shared/utilities/download'

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
            const manager = new LspManager(manifest, '2.0.0', tempFolder)
            const result = await manager.download()
            assert.deepStrictEqual(result, {
                assetDirectory: manager.getDownloadDirectory('2.0.0'),
                version: '2.0.0',
                location: 'cache',
            })
        })

        it('uses remote', async () => {
            sandbox.stub(download, 'downloadFrom').resolves({
                data: Buffer.from(''),
                hash: '',
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

            const manager = new LspManager(manifest, '2.0.0', tempFolder)
            const result = await manager.download()
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

            const manager = new LspManager(manifest, '2.0.0', tempFolder)
            const result = await manager.download()
            assert.deepStrictEqual(result, {
                assetDirectory: manager.getDownloadDirectory('2.0.0'),
                version: '2.0.0',
                location: 'remote',
            })
        })
    })
})
