/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as path from 'path'
import { Range } from 'semver'
import {
    LanguageServerResolver,
    findHighestCompleteInstalledServer,
    requireServerAndRequiredFiles,
    versionSatisfiesRange,
    zipEntryPosixMode,
} from '../../../shared/lsp/lspResolver'
import { LspVersion } from '../../../shared/lsp/types'
import { fs } from '../../../shared/fs/fs'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import AdmZip from 'adm-zip'
import {
    createManifest,
    createVersion,
    createPlatformVersion,
    createResolver,
    lspTestDefaults,
    TempTestDir,
} from './lspTestFixtures'

describe('LanguageServerResolver', function () {
    const { lsName } = lspTestDefaults

    describe('version selection', function () {
        const tmpDir = new TempTestDir()

        beforeEach(async function () {
            await tmpDir.setup()
        })

        afterEach(async function () {
            await tmpDir.teardown()
        })

        it('resolves the highest compatible version from an unordered manifest', async function () {
            const requested: string[] = []
            const resolver = createResolver(
                createManifest([
                    nonZipVersion('1.0.0'),
                    nonZipVersion('2.5.0'),
                    nonZipVersion('2.3.0'),
                    nonZipVersion('1.9.0'),
                ]),
                {
                    storageDir: tmpDir.path,
                    fetchFn: recordingFetch(requested),
                    sleepFn: noSleep,
                }
            )

            const result = await resolver.resolve()

            assert.strictEqual(result.version, '2.5.0')
            assert.strictEqual(result.location, 'remote')
            assert.deepStrictEqual(requested, ['https://example.com/server-2.5.0.zip'])
            assert.ok(await fs.existsFile(path.join(tmpDir.path, '2.5.0', 'server.js')))
        })

        it('never selects a delisted version even when it is the highest', async function () {
            const requested: string[] = []
            const resolver = createResolver(
                createManifest([nonZipVersion('1.0.0'), nonZipVersion('2.0.0', { isDelisted: true })]),
                {
                    storageDir: tmpDir.path,
                    fetchFn: recordingFetch(requested),
                    sleepFn: noSleep,
                }
            )

            const result = await resolver.resolve()

            assert.strictEqual(result.version, '1.0.0')
            assert.deepStrictEqual(requested, ['https://example.com/server-1.0.0.zip'])
        })
    })

    describe('platform target selection', function () {
        const tmpDir = new TempTestDir()

        beforeEach(async function () {
            await tmpDir.setup()
        })

        afterEach(async function () {
            await tmpDir.teardown()
        })

        function platformResolver(version: LspVersion, platform: string, arch: string, requested: string[]) {
            return createResolver(createManifest([version]), {
                storageDir: tmpDir.path,
                targetPlatformResolver: () => ({ platform, arch }),
                fetchFn: recordingFetch(requested),
                sleepFn: noSleep,
            })
        }

        function platformContents(url: string): LspVersion['targets'][0]['contents'] {
            return [{ filename: 'server.js', url, hashes: [], bytes: 0 }]
        }

        it('resolves the target matching the resolved platform (win32, not legacy windows)', async function () {
            const requested: string[] = []
            const version = createPlatformVersion(
                '1.0.0',
                'win32',
                'x64',
                platformContents('https://example.com/win.js')
            )
            const result = await platformResolver(version, 'win32', 'x64', requested).resolve()

            assert.strictEqual(result.version, '1.0.0')
            assert.strictEqual(result.location, 'remote')
            assert.deepStrictEqual(requested, ['https://example.com/win.js'])
        })

        it('rejects when no target matches the resolved platform', async function () {
            const requested: string[] = []
            const version = createPlatformVersion(
                '1.0.0',
                'windows',
                'x64',
                platformContents('https://example.com/win.js')
            )

            await assert.rejects(
                platformResolver(version, 'win32', 'x64', requested).resolve(),
                /Unable to find a language server/
            )
            assert.deepStrictEqual(requested, [], 'must not fetch when no target matches')
        })

        it('resolves a custom platform via an injected target resolver', async function () {
            const requested: string[] = []
            const version = createPlatformVersion(
                '1.0.0',
                'linuxglib2.28',
                'x64',
                platformContents('https://example.com/linux.js')
            )
            const result = await platformResolver(version, 'linuxglib2.28', 'x64', requested).resolve()

            assert.strictEqual(result.version, '1.0.0')
            assert.deepStrictEqual(requested, ['https://example.com/linux.js'])
        })
    })

    describe('managed cache validation', function () {
        const tmpDir = new TempTestDir()

        beforeEach(async function () {
            await tmpDir.setup()
        })

        afterEach(async function () {
            await tmpDir.teardown()
        })

        it('accepts complete nested bundles and rejects missing required directories', async function () {
            let fetchCalls = 0
            const resolver = createResolver(createManifest([createVersion('1.2.0')]), {
                storageDir: tmpDir.path,
                requiredFiles: ['bin', 'node_modules'],
                fetchFn: async () => {
                    fetchCalls++
                    throw new Error('offline')
                },
                sleepFn: async () => {},
            })
            const versionDir = path.join(tmpDir.path, '1.2.0')
            const bundleDir = path.join(versionDir, 'server-1.2.0')
            await fs.mkdir(path.join(bundleDir, 'bin'))
            await fs.mkdir(path.join(bundleDir, 'node_modules'))
            await fs.writeFile(path.join(bundleDir, 'server.js'), 'server')

            const cached = await resolver.resolve()
            assert.strictEqual(cached.location, 'cache')
            assert.strictEqual(cached.assetDirectory, versionDir)
            assert.strictEqual(fetchCalls, 0)

            await fs.delete(path.join(bundleDir, 'node_modules'), { force: true, recursive: true })
            await assert.rejects(resolver.resolve())
            assert.ok(fetchCalls > 0)
        })
    })

    describe('hash verification', function () {
        function hashResolver(): LanguageServerResolver {
            return new LanguageServerResolver(createManifest([]), {
                lsName: lspTestDefaults.lsName,
                versionRange: new Range('>=1.0.0'),
                serverFilename: 'server.js',
                storageDir: lspTestDefaults.storageDir,
            })
        }

        it('verifies algorithm:digest format (sha256)', async function () {
            const data = Buffer.from('test content')
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, [`sha256:${rawHex}`]), true)
        })

        it('verifies algorithm:digest format (sha384)', async function () {
            const data = Buffer.from('sha384 test content')
            const rawHex = require('crypto').createHash('sha384').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, [`sha384:${rawHex}`]), true)
        })

        it('compares case-insensitively', async function () {
            const data = Buffer.from('case insensitive test')
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, [`sha256:${rawHex.toUpperCase()}`]), true)
            assert.strictEqual(verifyHash(data, [`SHA256:${rawHex}`]), true)
        })

        it('any valid matching hash passes (multi-hash)', async function () {
            const data = Buffer.from('multi hash test')
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, ['sha256:wrong', `sha256:${rawHex}`]), true)
        })

        it('fails when no hash matches (mismatch)', async function () {
            const data = Buffer.from('no match')

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, ['sha256:wrong1', 'sha384:wrong2']), false)
        })

        it('skips verification when no hashes provided (empty array)', async function () {
            const data = Buffer.from('no hashes')

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, []), true)
        })

        it('fails closed on a raw hex digest with no algorithm prefix', async function () {
            const data = Buffer.from('raw hex only')
            const rawHex = require('crypto').createHash('sha384').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, [rawHex]), false)
        })

        it('fails closed when all declared hashes use unsupported algorithms', async function () {
            const data = Buffer.from('unsupported algo')

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, ['unsupported_algo:abc123', 'fake_hash:xyz']), false)
        })

        it('fails closed when a declared hash has an empty digest', async function () {
            const data = Buffer.from('empty digest')

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, ['sha256:']), false)
        })

        it('fails closed when a declared hash is malformed/empty', async function () {
            const data = Buffer.from('malformed')

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, ['']), false)
        })

        it('fails when mixed unsupported + valid but no match', async function () {
            const data = Buffer.from('mixed algos')

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, ['unsupported_algo:abc123', 'sha256:wrongdigest']), false)
        })

        it('passes when mixed unsupported + valid and valid matches', async function () {
            const data = Buffer.from('mixed algos pass')
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const verifyHash = (hashResolver() as any).verifyHash.bind(hashResolver())
            assert.strictEqual(verifyHash(data, ['unsupported_algo:abc123', `sha256:${rawHex}`]), true)
        })
    })

    describe('download retries', function () {
        const tmpDir = new TempTestDir()

        beforeEach(async function () {
            await tmpDir.setup()
        })

        afterEach(async function () {
            await tmpDir.teardown()
        })

        it('retries exactly 3 times with exponential backoff before failing', async function () {
            const sleepCalls: number[] = []
            const resolver = createResolver(createManifest([createVersion('1.0.0')]), {
                storageDir: tmpDir.path,
                fetchFn: async () => {
                    throw new Error('download failed')
                },
                sleepFn: async (ms: number) => {
                    sleepCalls.push(ms)
                },
            })

            await assert.rejects(resolver.resolve())

            assert.deepStrictEqual(sleepCalls, [500, 1000])
        })

        it('recovers on the second attempt and installs the payload', async function () {
            let calls = 0
            const resolver = createResolver(createManifest([nonZipVersion('1.0.0')]), {
                storageDir: tmpDir.path,
                fetchFn: async () => {
                    calls++
                    if (calls === 1) {
                        throw new Error('transient network error')
                    }
                    return { status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('server-body')) }
                },
                sleepFn: noSleep,
            })

            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'remote')
            assert.strictEqual(result.version, '1.0.0')
            assert.strictEqual(calls, 2)
            assert.ok(await fs.existsFile(path.join(tmpDir.path, '1.0.0', 'server.js')))
        })

        it('retries only the failing content and fetches the successful content once', async function () {
            const calls: Record<string, number> = {}
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    {
                        platform: process.platform,
                        arch: process.arch,
                        contents: [
                            { filename: 'server.js', url: 'https://example.com/server.js', hashes: [], bytes: 0 },
                            { filename: 'extra.js', url: 'https://example.com/extra.js', hashes: [], bytes: 0 },
                        ],
                    },
                ],
            }
            const resolver = createResolver(createManifest([version]), {
                storageDir: tmpDir.path,
                fetchFn: async (url: string) => {
                    calls[url] = (calls[url] ?? 0) + 1
                    if (url.endsWith('extra.js') && calls[url] < 3) {
                        throw new Error('transient network error')
                    }
                    return { status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('body')) }
                },
                sleepFn: noSleep,
            })

            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'remote')
            assert.strictEqual(calls['https://example.com/server.js'], 1)
            assert.strictEqual(calls['https://example.com/extra.js'], 3)
            assert.ok(await fs.existsFile(path.join(tmpDir.path, '1.0.0', 'server.js')))
        })

        it('downloads contents sequentially in manifest order', async function () {
            const requested: string[] = []
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    {
                        platform: process.platform,
                        arch: process.arch,
                        contents: [
                            { filename: 'server.js', url: 'https://example.com/a-server.js', hashes: [], bytes: 0 },
                            { filename: 'extra.js', url: 'https://example.com/b-extra.js', hashes: [], bytes: 0 },
                        ],
                    },
                ],
            }
            const resolver = createResolver(createManifest([version]), {
                storageDir: tmpDir.path,
                fetchFn: async (url: string) => {
                    requested.push(url)
                    return { status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('body')) }
                },
                sleepFn: noSleep,
            })

            await resolver.resolve()

            assert.deepStrictEqual(requested, ['https://example.com/a-server.js', 'https://example.com/b-extra.js'])
        })
    })

    describe('artifact HTTP status handling (exactly 200)', function () {
        const tmpDir = new TempTestDir()

        beforeEach(async function () {
            await tmpDir.setup()
        })

        afterEach(async function () {
            await tmpDir.teardown()
        })

        it('accepts exactly HTTP 200 and installs the payload', async function () {
            const resolver = createResolver(createManifest([nonZipVersion('1.0.0')]), {
                storageDir: tmpDir.path,
                fetchFn: async () => ({ status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('body')) }),
                sleepFn: noSleep,
            })

            const result = await resolver.resolve()

            assert.strictEqual(result.location, 'remote')
            assert.ok(await fs.existsFile(path.join(tmpDir.path, '1.0.0', 'server.js')))
        })

        it('rejects a 206 partial response, retries the full 3 attempts, and writes nothing', async function () {
            let calls = 0
            const resolver = createResolver(createManifest([nonZipVersion('1.0.0')]), {
                storageDir: tmpDir.path,
                fetchFn: async () => {
                    calls++
                    return { status: 206, arrayBuffer: async () => toArrayBuffer(Buffer.from('partial')) }
                },
                sleepFn: noSleep,
            })

            await assert.rejects(resolver.resolve())

            assert.strictEqual(calls, 3, 'a non-200 status must be retried the full 3 attempts')
            assert.ok(!(await fs.existsDir(path.join(tmpDir.path, '1.0.0'))), 'a failed download writes nothing')
        })
    })

    describe('zip extraction and zip-slip rejection', function () {
        const tmpDir = new TempTestDir()

        beforeEach(async function () {
            await tmpDir.setup()
        })

        afterEach(async function () {
            await tmpDir.teardown()
        })

        function zipResolver(buffer: Buffer): LanguageServerResolver {
            const version = createVersion('1.0.0')
            version.targets[0].contents[0].bytes = 0
            return createResolver(createManifest([version]), {
                storageDir: tmpDir.path,
                fetchFn: async () => ({ status: 200, arrayBuffer: async () => toArrayBuffer(buffer) }),
                sleepFn: noSleep,
            })
        }

        it('extracts directly into the version dir without persisting the downloaded archive', async function () {
            const zip = new AdmZip()
            zip.addFile('server.js', Buffer.from('console.log("hello")'))
            zip.addFile('bin/helper', Buffer.from('x'))

            const result = await zipResolver(zip.toBuffer()).resolve()

            assert.strictEqual(result.location, 'remote')
            const versionDir = path.join(tmpDir.path, '1.0.0')
            assert.ok(await fs.existsFile(path.join(versionDir, 'server.js')))
            assert.ok(await fs.existsFile(path.join(versionDir, 'bin', 'helper')))
            assert.ok(
                !(await fs.existsDir(path.join(versionDir, 'server-1.0.0'))),
                'must not create a zip-basename dir'
            )
            const names = (await fs.readdir(versionDir)).map(([n]) => n)
            assert.ok(!names.includes('server-1.0.0.zip'), `downloaded archive must not persist: ${names}`)
        })

        it('rejects a zip-slip entry as an extraction failure and writes nothing', async function () {
            const zip = new AdmZip()
            zip.addFile('server.js', Buffer.from('ok'))
            zip.addFile('../../../etc/malicious.txt', Buffer.from('evil'))

            await assert.rejects(zipResolver(zip.toBuffer()).resolve())

            assert.ok(!(await fs.existsDir(path.join(tmpDir.path, '1.0.0'))))
        })

        const escapingEntryNames = ['a/../../b', '/etc/passwd', '..\\..\\evil', '\\\\server\\share\\x']
        if (process.platform === 'win32') {
            escapingEntryNames.push('C:\\Windows\\x', 'C:/Windows/x')
        }
        for (const entryName of escapingEntryNames) {
            it(`rejects the escaping entry "${entryName}" after separator normalization`, async function () {
                const zip = new AdmZip()
                zip.addFile('server.js', Buffer.from('ok'))
                zip.addFile(entryName, Buffer.from('evil'))

                await assert.rejects(zipResolver(zip.toBuffer()).resolve(), { code: 'ExtractionFailed' })

                assert.ok(!(await fs.existsDir(path.join(tmpDir.path, '1.0.0'))))
            })
        }

        it('extracts entries whose normalized path stays inside the version dir', async function () {
            const zip = new AdmZip()
            zip.addFile('server.js', Buffer.from('ok'))
            zip.addFile('a/../b.txt', Buffer.from('b'))
            zip.addFile('./c.txt', Buffer.from('c'))
            zip.addFile('foo\\bar.txt', Buffer.from('bar'))
            zip.addFile('dir/', Buffer.alloc(0))

            await zipResolver(zip.toBuffer()).resolve()

            const versionDir = path.join(tmpDir.path, '1.0.0')
            assert.ok(await fs.existsFile(path.join(versionDir, 'b.txt')))
            assert.ok(await fs.existsFile(path.join(versionDir, 'c.txt')))
            assert.ok(await fs.existsFile(path.join(versionDir, 'foo', 'bar.txt')))
            assert.ok(await fs.existsDir(path.join(versionDir, 'dir')))
        })

        it('preserves executable and read-only POSIX permissions from ZIP external attributes', async function () {
            if (process.platform === 'win32') {
                this.skip()
            }
            const zip = new AdmZip()
            zip.addFile('server.js', Buffer.from('console.log("hello")'))
            zip.addFile('bin/exec', Buffer.from('x'), '', 0o755)
            zip.addFile('readonly.txt', Buffer.from('ro'), '', 0o444)
            const versionDir = path.join(tmpDir.path, '1.0.0')
            await fs.mkdir(path.join(versionDir, 'bin'))
            await fs.writeFile(path.join(versionDir, 'bin', 'exec'), 'stale')
            await fs.chmod(path.join(versionDir, 'bin', 'exec'), 0o600)

            await zipResolver(zip.toBuffer()).resolve()

            const execMode = nodeFs.statSync(path.join(versionDir, 'bin', 'exec')).mode
            assert.ok((execMode & 0o100) !== 0, `expected owner-executable bit, got ${(execMode & 0o777).toString(8)}`)

            const roMode = nodeFs.statSync(path.join(versionDir, 'readonly.txt')).mode
            assert.ok((roMode & 0o400) !== 0, 'read-only entry must remain readable')
            assert.strictEqual(roMode & 0o200, 0, 'read-only entry must not carry an owner-write bit')
        })

        it('creates parent directories for archives that omit explicit directory entries', async function () {
            const zip = new AdmZip()
            zip.addFile('server.js', Buffer.from('server'))
            zip.addFile('nested/dir/file.txt', Buffer.from('deep'))

            await zipResolver(zip.toBuffer()).resolve()

            const versionDir = path.join(tmpDir.path, '1.0.0')
            assert.ok(await fs.existsFile(path.join(versionDir, 'nested', 'dir', 'file.txt')))
        })
    })

    describe('required files validation', function () {
        const tmpDir = new TempTestDir()

        beforeEach(async function () {
            await tmpDir.setup()
        })

        afterEach(async function () {
            await tmpDir.teardown()
        })

        it('passes when the server file and required files exist', async function () {
            await fs.writeFile(path.join(tmpDir.path, 'server.js'), 'content')
            await fs.mkdir(path.join(tmpDir.path, 'node_modules'))

            const resolver = createResolver(createManifest([]), {
                storageDir: tmpDir.path,
                requiredFiles: ['node_modules'],
            })

            await assert.doesNotReject((resolver as any).validateInstall(tmpDir.path))
        })

        it('throws when a required file is missing', async function () {
            await fs.writeFile(path.join(tmpDir.path, 'server.js'), 'content')

            const resolver = createResolver(createManifest([]), {
                storageDir: tmpDir.path,
                requiredFiles: ['node_modules'],
            })

            await assert.rejects((resolver as any).validateInstall(tmpDir.path), /Required files missing.*node_modules/)
        })
    })

    describe('storageDir configuration', function () {
        it('places version installs directly under the provided storageDir', function () {
            const resolver = new LanguageServerResolver(createManifest([createVersion('1.0.0')]), {
                lsName,
                versionRange: new Range('>=1.0.0', { includePrerelease: true }),
                serverFilename: 'server.js',
                storageDir: path.join('/custom', 'path'),
            })

            assert.strictEqual((resolver as any).getDownloadDirectory('1.0.0'), path.join('/custom', 'path', '1.0.0'))
        })

        it('defaults to platform cache/aws/language-servers/<name> with no toolkits segment', function () {
            const resolver = new LanguageServerResolver(createManifest([createVersion('1.0.0')]), {
                lsName,
                versionRange: new Range('>=1.0.0', { includePrerelease: true }),
                serverFilename: 'server.js',
            })

            const dir = (resolver as any).getDownloadDirectory('1.0.0')
            assert.ok(
                dir.includes(path.join('aws', 'language-servers', lsName)),
                `expected default under aws/language-servers/${lsName} but got: ${dir}`
            )
            assert.ok(!dir.includes(path.join('aws', 'toolkits')), `should not contain a toolkits segment: ${dir}`)
        })
    })
})

function toArrayBuffer(buf: Buffer): ArrayBuffer {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function installFakeServer(baseDir: string, version: string, files: string[]): Promise<void> {
    const dir = path.join(baseDir, version)
    await fs.mkdir(dir)
    for (const file of files) {
        await fs.writeFile(path.join(dir, file), 'content')
    }
}

const noSleep = async () => {}

function nonZipVersion(serverVersion: string, opts?: { isDelisted?: boolean; filename?: string }): LspVersion {
    const version = createVersion(serverVersion, {
        filename: opts?.filename ?? 'server.js',
        hashes: [],
        isDelisted: opts?.isDelisted,
    })
    version.targets[0].contents[0].bytes = 0
    return version
}

function recordingFetch(
    requested: string[]
): (url: string) => Promise<{ status: number; arrayBuffer(): Promise<ArrayBuffer> }> {
    return async (url: string) => {
        requested.push(url)
        return { status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('non-zip-body')) }
    }
}

describe('zipEntryPosixMode', function () {
    it('extracts the rwx permission bits from a ZIP entry external attribute', function () {
        assert.strictEqual(zipEntryPosixMode(((0x8000 | 0o755) << 16) >>> 0), 0o755)
        assert.strictEqual(zipEntryPosixMode(((0x8000 | 0o644) << 16) >>> 0), 0o644)
        assert.strictEqual(zipEntryPosixMode(((0x8000 | 0o444) << 16) >>> 0), 0o444)
    })

    it('discards file-type and setuid/setgid/sticky bits, keeping only rwx', function () {
        assert.strictEqual(zipEntryPosixMode((0o104755 << 16) >>> 0), 0o755)
    })

    it('returns undefined when no Unix mode is recorded, so default permissions are kept', function () {
        assert.strictEqual(zipEntryPosixMode(0), undefined)
        assert.strictEqual(zipEntryPosixMode(0x20), undefined)
    })
})

describe('requireServerAndRequiredFiles - server-anchored root', function () {
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    it('accepts a direct-root layout', async function () {
        await fs.writeFile(path.join(tmpDir.path, 'server.js'), 'x')
        await fs.mkdir(path.join(tmpDir.path, 'bin'))
        await assert.doesNotReject(requireServerAndRequiredFiles(tmpDir.path, 'server.js', ['bin']))
    })

    it('accepts a one-level nested layout', async function () {
        const child = path.join(tmpDir.path, 'bundle')
        await fs.mkdir(path.join(child, 'bin'))
        await fs.writeFile(path.join(child, 'server.js'), 'x')
        await assert.doesNotReject(requireServerAndRequiredFiles(tmpDir.path, 'server.js', ['bin']))
    })

    it('throws when the server file is missing', async function () {
        await fs.mkdir(path.join(tmpDir.path, 'bin'))
        await assert.rejects(
            requireServerAndRequiredFiles(tmpDir.path, 'server.js', ['bin']),
            /Server file "server.js" not found/
        )
    })

    it('throws when a required file is missing relative to the server root', async function () {
        const child = path.join(tmpDir.path, 'bundle')
        await fs.mkdir(child)
        await fs.writeFile(path.join(child, 'server.js'), 'x')
        await fs.mkdir(path.join(tmpDir.path, 'bin'))
        await assert.rejects(
            requireServerAndRequiredFiles(tmpDir.path, 'server.js', ['bin']),
            /Required files missing.*bin/
        )
    })
})

describe('findHighestCompleteInstalledServer', function () {
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    it('returns the highest complete install within range, skipping incomplete and out-of-range', async function () {
        await installFakeServer(tmpDir.path, '1.0.0', ['server.js'])
        await installFakeServer(tmpDir.path, '1.4.0', ['server.js'])
        await fs.mkdir(path.join(tmpDir.path, '1.5.0'))
        await installFakeServer(tmpDir.path, '2.5.0', ['server.js'])

        const found = await findHighestCompleteInstalledServer(
            tmpDir.path,
            new Range('<2.0.0', { includePrerelease: true }),
            'server.js',
            []
        )
        assert.strictEqual(found?.version, '1.4.0')
    })

    it('returns undefined when nothing complete is installed', async function () {
        await fs.mkdir(path.join(tmpDir.path, '1.0.0'))
        const found = await findHighestCompleteInstalledServer(
            tmpDir.path,
            new Range('<2.0.0', { includePrerelease: true }),
            'server.js',
            []
        )
        assert.strictEqual(found, undefined)
    })
})

describe('LanguageServerResolver - download integrity and fallback (parity)', function () {
    const { lsName } = lspTestDefaults
    const range = new Range('>=1.0.0 <2.0.0', { includePrerelease: true })
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    function makeResolver(
        manifest: ReturnType<typeof createManifest>,
        fetchFn: (...args: any[]) => Promise<any>,
        requiredFiles: string[] = []
    ): LanguageServerResolver {
        return new LanguageServerResolver(manifest, {
            lsName,
            versionRange: range,
            serverFilename: 'server.js',
            storageDir: tmpDir.path,
            requiredFiles,
            fetchFn: fetchFn as any,
            sleepFn: noSleep,
        })
    }

    it('treats a positive TargetContent.bytes mismatch as a download failure and creates no version dir', async function () {
        const data = Buffer.from('12345')
        const version = createVersion('1.0.0', { filename: 'server.js' })
        const resolver = makeResolver(createManifest([version]), async () => ({
            status: 200,
            arrayBuffer: async () => toArrayBuffer(data),
        }))

        await assert.rejects(resolver.resolve())

        const remaining = await fs.readdir(tmpDir.path)
        assert.strictEqual(remaining.length, 0, `expected no version dir, found: ${remaining.map(([n]) => n)}`)
    })

    it('propagates a hash-integrity failure without falling back, leaving no failed version dir', async function () {
        await installFakeServer(tmpDir.path, '1.5.0', ['server.js'])

        const data = Buffer.from('payload')
        const latest = createVersion('1.9.0', { filename: 'server.js', hashes: ['sha256:deadbeef'] })
        latest.targets[0].contents[0].bytes = 0
        const manifest = createManifest([latest, createVersion('1.5.0', { filename: 'server.js' })])

        const resolver = makeResolver(manifest, async () => ({
            status: 200,
            arrayBuffer: async () => toArrayBuffer(data),
        }))

        await assert.rejects(resolver.resolve(), (err: any) => err.code === 'HashIntegrityFailed')

        assert.ok(await fs.existsDir(path.join(tmpDir.path, '1.5.0')))
        assert.ok(!(await fs.existsDir(path.join(tmpDir.path, '1.9.0'))), 'the failed version dir must not remain')
    })

    it('falls back to the highest complete installed server, even above the failed version', async function () {
        await installFakeServer(tmpDir.path, '1.5.0', ['server.js'])
        const manifest = createManifest([createVersion('1.0.0', { filename: 'server.js' })])
        const resolver = makeResolver(manifest, async () => {
            throw new Error('network down')
        })

        const result = await resolver.resolve()
        assert.strictEqual(result.location, 'fallback')
        assert.strictEqual(result.version, '1.5.0')
    })

    it('treats a missing server file as deterministic: fetches once, then uses a complete fallback', async function () {
        await installFakeServer(tmpDir.path, '1.5.0', ['server.js'])

        let fetchCount = 0
        const version = createVersion('1.9.0', { filename: 'wrong-name.js', hashes: [] })
        version.targets[0].contents[0].bytes = 0
        const resolver = makeResolver(createManifest([version]), async () => {
            fetchCount++
            return { status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('payload')) }
        })

        const result = await resolver.resolve()

        assert.strictEqual(result.location, 'fallback')
        assert.strictEqual(result.version, '1.5.0')
        assert.strictEqual(fetchCount, 1, 'must not re-download on a deterministic missing-server failure')
    })

    it('selects a matching target with empty contents, then uses the highest complete installed fallback', async function () {
        await installFakeServer(tmpDir.path, '1.5.0', ['server.js'])
        const emptyContents: LspVersion = {
            serverVersion: '1.9.0',
            isDelisted: false,
            targets: [{ platform: process.platform, arch: process.arch, contents: [] }],
        }
        let fetchCount = 0
        const resolver = makeResolver(
            createManifest([emptyContents, createVersion('1.5.0', { filename: 'server.js' })]),
            async () => {
                fetchCount++
                return { status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('x')) }
            }
        )

        const result = await resolver.resolve()

        assert.strictEqual(result.location, 'fallback')
        assert.strictEqual(result.version, '1.5.0')
        assert.strictEqual(fetchCount, 0, 'a matching target with empty contents downloads nothing')
    })

    it('passes a distinct AbortSignal to each artifact fetch', async function () {
        const receivedSignals: unknown[] = []
        const version = nonZipVersion('1.0.0')
        version.targets[0].contents.push({ ...version.targets[0].contents[0], filename: 'second.txt' })
        const resolver = makeResolver(createManifest([version]), async (_url: string, init: { signal: unknown }) => {
            receivedSignals.push(init.signal)
            return { status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('body')) }
        })

        await resolver.resolve()

        assert.strictEqual(receivedSignals.length, 2)
        assert.ok(receivedSignals.every((signal) => signal instanceof AbortSignal))
        assert.notStrictEqual(receivedSignals[0], receivedSignals[1])
    })

    it('retains unrelated pre-existing files when overwriting a version dir in place', async function () {
        const versionDir = path.join(tmpDir.path, '1.0.0')
        await fs.mkdir(versionDir)
        await fs.writeFile(path.join(versionDir, 'unrelated.txt'), 'keep me')

        const resolver = makeResolver(createManifest([nonZipVersion('1.0.0')]), async () => ({
            status: 200,
            arrayBuffer: async () => toArrayBuffer(Buffer.from('server-body')),
        }))

        const result = await resolver.resolve()

        assert.strictEqual(result.location, 'remote')
        assert.ok(await fs.existsFile(path.join(versionDir, 'server.js')), 'freshly installed server file')
        assert.ok(await fs.existsFile(path.join(versionDir, 'unrelated.txt')), 'unrelated file must survive overwrite')
    })

    it('removes the entire version dir, including pre-existing content, on a missing-server failure then falls back', async function () {
        await installFakeServer(tmpDir.path, '1.5.0', ['server.js'])
        const stale = path.join(tmpDir.path, '1.9.0')
        await fs.mkdir(stale)
        await fs.writeFile(path.join(stale, 'stale.txt'), 'stale')

        const version = createVersion('1.9.0', { filename: 'wrong-name.js', hashes: [] })
        version.targets[0].contents[0].bytes = 0
        const resolver = makeResolver(
            createManifest([version, createVersion('1.5.0', { filename: 'server.js' })]),
            async () => ({ status: 200, arrayBuffer: async () => toArrayBuffer(Buffer.from('payload')) })
        )

        const result = await resolver.resolve()

        assert.strictEqual(result.location, 'fallback')
        assert.strictEqual(result.version, '1.5.0')
        assert.ok(
            !(await fs.existsDir(stale)),
            'failed version dir must be fully removed, including pre-existing files'
        )
    })

    it('writes nothing when any content in the set fails preflight (all-or-nothing)', async function () {
        const badZip = new AdmZip()
        badZip.addFile('../evil.txt', Buffer.from('evil'))
        const badBuffer = badZip.toBuffer()

        const version: LspVersion = {
            serverVersion: '1.0.0',
            isDelisted: false,
            targets: [
                {
                    platform: process.platform,
                    arch: process.arch,
                    contents: [
                        { filename: 'server.js', url: 'https://example.com/server.js', hashes: [], bytes: 0 },
                        { filename: 'bundle.zip', url: 'https://example.com/bundle.zip', hashes: [], bytes: 0 },
                    ],
                },
            ],
        }
        const resolver = makeResolver(createManifest([version]), async (url: string) => ({
            status: 200,
            arrayBuffer: async () => toArrayBuffer(url.endsWith('bundle.zip') ? badBuffer : Buffer.from('server-body')),
        }))

        await assert.rejects(resolver.resolve())

        assert.ok(!(await fs.existsDir(path.join(tmpDir.path, '1.0.0'))), 'a preflight rejection must write nothing')
    })

    it('preserves the original error when cleanup of a failed install throws', async function () {
        const sandbox = sinon.createSandbox()
        const cleanupError = new Error('cleanup boom')
        try {
            const version = createVersion('1.9.0', { filename: 'server.js', hashes: ['sha256:deadbeef'] })
            version.targets[0].contents[0].bytes = 0
            const resolver = makeResolver(createManifest([version]), async () => ({
                status: 200,
                arrayBuffer: async () => toArrayBuffer(Buffer.from('payload')),
            }))
            sandbox.stub(fs, 'delete').rejects(cleanupError)

            await assert.rejects(resolver.resolve(), (err: any) => {
                assert.strictEqual(err.code, 'HashIntegrityFailed', 'original error must propagate')
                assert.ok(
                    Array.isArray(err.suppressed) && err.suppressed.includes(cleanupError),
                    'cleanup failure must be attached as suppressed, not mask the original'
                )
                return true
            })
        } finally {
            sandbox.restore()
        }
    })
})

describe('version directory path guard', function () {
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    function guardResolver(): LanguageServerResolver {
        return createResolver(createManifest([]), { storageDir: tmpDir.path })
    }

    it('rejects versions that are not safe single-directory segments', function () {
        const resolver = guardResolver()
        for (const bad of ['..', '../evil', 'a/b', 'a\\b', '/abs', 'not-semver', '']) {
            assert.throws(
                () => (resolver as any).getDownloadDirectory(bad),
                (err: any) => err.code === 'NoCompatibleVersion',
                `expected "${bad}" to be rejected`
            )
        }
    })

    it('accepts a valid version and preserves build metadata', function () {
        const resolver = guardResolver()
        assert.strictEqual(
            (resolver as any).getDownloadDirectory('1.2.3+build.5'),
            path.join(tmpDir.path, '1.2.3+build.5')
        )
    })
})

describe('semver range parity (JetBrains SemVerRange.satisfiedBy)', function () {
    const { lsName } = lspTestDefaults
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    const cases: [string, string, boolean][] = [
        ['2.0.0-beta.1', '<2.0.0', false],
        ['2.0.0', '<2.0.0', false],
        ['1.9.9', '<2.0.0', true],
        ['1.5.0-beta.1', '<2.0.0', true],
        ['2.0.0-beta.1', '>=1.0.0 <2.0.0', false],
        ['1.0.0', '>=1.0.0', true],
        ['0.9.0', '>=1.0.0', false],
        ['1.2.3', '=1.2.3', true],
        ['1.2.3-rc.1', '=1.2.3', false],
        ['1.2.3', '*', true],
    ]
    for (const [version, range, expected] of cases) {
        it(`versionSatisfiesRange: ${version} vs ${range} => ${expected}`, function () {
            assert.strictEqual(versionSatisfiesRange(version, new Range(range, { includePrerelease: true })), expected)
        })
    }

    it('returns false for an unparseable version', function () {
        assert.strictEqual(versionSatisfiesRange('not-semver', new Range('<2.0.0')), false)
    })

    function ltResolver(
        versions: LspVersion[],
        requested: string[],
        fetchFn?: (...args: any[]) => Promise<any>
    ): LanguageServerResolver {
        return new LanguageServerResolver(createManifest(versions), {
            lsName,
            versionRange: new Range('<2.0.0', { includePrerelease: true }),
            serverFilename: 'server.js',
            storageDir: tmpDir.path,
            fetchFn: (fetchFn ?? recordingFetch(requested)) as any,
            sleepFn: noSleep,
        })
    }

    it('manifest selection rejects a 2.0.0-beta prerelease against <2.0.0', async function () {
        const requested: string[] = []
        const result = await ltResolver([nonZipVersion('1.9.0'), nonZipVersion('2.0.0-beta.1')], requested).resolve()

        assert.strictEqual(result.version, '1.9.0')
        assert.deepStrictEqual(requested, ['https://example.com/server-1.9.0.zip'])
    })

    it('manifest selection admits an in-range prerelease (1.5.0-beta.1 satisfies <2.0.0)', async function () {
        const requested: string[] = []
        const result = await ltResolver([nonZipVersion('1.5.0-beta.1')], requested).resolve()

        assert.strictEqual(result.version, '1.5.0-beta.1')
        assert.deepStrictEqual(requested, ['https://example.com/server-1.5.0-beta.1.zip'])
    })

    it('installed fallback picks an in-range prerelease and never a 2.0.0-beta out of range', async function () {
        await installFakeServer(tmpDir.path, '1.5.0-beta.1', ['server.js'])
        await installFakeServer(tmpDir.path, '2.0.0-beta.1', ['server.js'])
        const resolver = ltResolver([createVersion('1.0.0', { filename: 'server.js' })], [], async () => {
            throw new Error('network down')
        })

        const result = await resolver.resolve()

        assert.strictEqual(result.location, 'fallback')
        assert.strictEqual(result.version, '1.5.0-beta.1')
    })
})
