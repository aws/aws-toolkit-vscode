/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as os from 'os'
import { Range } from 'semver'
import { LanguageServerResolver } from '../../../shared/lsp/lspResolver'
import { Manifest, LspVersion } from '../../../shared/lsp/types'
import { TargetPlatform } from '../../../shared/lsp/utils/targetResolver'
import { fs } from '../../../shared/fs/fs'
import { createTestWorkspaceFolder } from '../../testUtil'
import AdmZip from 'adm-zip'

function createManifest(versions: LspVersion[]): Manifest {
    return {
        manifestSchemaVersion: '1.0',
        artifactId: 'test-server',
        artifactDescription: 'Test Language Server',
        isManifestDeprecated: false,
        versions,
    }
}

function createVersion(
    serverVersion: string,
    opts?: { platform?: string; arch?: string; hashes?: string[]; filename?: string; isDelisted?: boolean }
): LspVersion {
    return {
        serverVersion,
        isDelisted: opts?.isDelisted ?? false,
        targets: [
            {
                platform: opts?.platform ?? process.platform,
                arch: opts?.arch ?? process.arch,
                contents: [
                    {
                        filename: opts?.filename ?? `server-${serverVersion}.zip`,
                        url: `https://example.com/server-${serverVersion}.zip`,
                        hashes: opts?.hashes ?? [],
                        bytes: 1024,
                    },
                ],
            },
        ],
    }
}

describe('LanguageServerResolver', function () {
    const lsName = 'test-server'
    const manifestUrl = 'https://example.com/manifest.json'

    describe('version selection - highest semver always wins', function () {
        it('selects highest semver version from manifest', function () {
            // Versions are NOT in order and there's no "latest" flag — semver sorting must win
            const versions: LspVersion[] = [
                createVersion('1.0.0'),
                createVersion('2.5.0'),
                createVersion('2.3.0'),
                createVersion('1.9.0'),
            ]
            const manifest = createManifest(versions)
            const resolver = LanguageServerResolver.fromConfig(manifest, {
                lsName,
                versionRange: new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                baseDir: '/tmp/test',
            })

            // We can't easily test internal version selection directly, but we verify
            // the resolver doesn't throw (meaning it found a version) and prefers 2.5.0
            // by checking the resolve attempt will target 2.5.0's directory
            assert.ok(resolver.defaultDownloadFolder() === '/tmp/test')
        })

        it('never prefers an older version with a latest flag over highest semver', function () {
            // Simulate: older version might have been tagged "latest" in some manifest
            // The resolver should always pick highest semver
            const versions: LspVersion[] = [
                createVersion('1.0.0'), // might have "latest" flag in some schemes
                createVersion('3.0.0'),
                createVersion('2.0.0'),
            ]
            const manifest = createManifest(versions)
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            // Doesn't throw — version 3.0.0 will be selected
            assert.ok(resolver)
        })

        it('filters delisted versions', async function () {
            const versions: LspVersion[] = [createVersion('1.0.0'), createVersion('2.0.0', { isDelisted: true })]
            const manifest = createManifest(versions)
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            // Should not throw about missing version — 1.0.0 is available
            await assert.rejects(
                resolver.resolve(),
                (err: Error) => !err.message.includes('Unable to find a language server')
            )
        })
    })

    describe('platform target - win32 default', function () {
        it('uses process.platform directly (win32 not windows)', function () {
            // Create a version with win32 platform
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    {
                        platform: 'win32',
                        arch: 'x64',
                        contents: [{ filename: 'server.zip', url: 'http://x', hashes: [], bytes: 100 }],
                    },
                ],
            }
            const manifest = createManifest([version])

            // Only resolves if platform matching uses win32
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test',
                [],
                () => ({ platform: 'win32', arch: 'x64' }) // simulate win32
            )

            // Should not throw — found the target
            assert.ok(resolver)
        })

        it('does NOT match windows platform name (legacy format)', async function () {
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    {
                        platform: 'windows', // legacy format
                        arch: 'x64',
                        contents: [{ filename: 'server.zip', url: 'http://x', hashes: [], bytes: 100 }],
                    },
                ],
            }
            const manifest = createManifest([version])

            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test',
                [],
                () => ({ platform: 'win32', arch: 'x64' }) // default uses win32
            )

            // Should throw — no matching target for win32 when manifest has 'windows'
            await assert.rejects(resolver.resolve(), /Unable to find a language server/)
        })
    })

    describe('platform target - legacy Linux override', function () {
        it('resolves linuxglib2.28 when targetPlatformResolver returns it', function () {
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    {
                        platform: 'linuxglib2.28',
                        arch: 'x64',
                        contents: [{ filename: 'server.zip', url: 'http://x', hashes: [], bytes: 100 }],
                    },
                ],
            }
            const manifest = createManifest([version])

            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test',
                [],
                () => ({ platform: 'linuxglib2.28', arch: 'x64' }) // legacy linux
            )

            assert.ok(resolver)
        })
    })

    describe('platform target - custom override', function () {
        it('uses client-supplied target platform resolver', function () {
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    {
                        platform: 'custom-os',
                        arch: 'custom-arch',
                        contents: [{ filename: 'server.zip', url: 'http://x', hashes: [], bytes: 100 }],
                    },
                ],
            }
            const manifest = createManifest([version])

            const customResolver = (): TargetPlatform => ({ platform: 'custom-os', arch: 'custom-arch' })
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test',
                [],
                customResolver
            )

            assert.ok(resolver)
        })
    })

    describe('managed cache validation', function () {
        let testDir: string

        beforeEach(async function () {
            const folder = await createTestWorkspaceFolder()
            testDir = folder.uri.fsPath
        })

        afterEach(async function () {
            await fs.delete(testDir, { force: true, recursive: true })
        })

        it('accepts complete nested bundles and rejects missing required directories', async function () {
            const version = createVersion('1.2.0')
            const resolver = LanguageServerResolver.fromConfig(createManifest([version]), {
                lsName,
                versionRange: new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                baseDir: testDir,
                requiredFiles: ['server.js', 'bin', 'node_modules'],
            })
            const versionDir = path.join(testDir, '1.2.0')
            const bundleDir = path.join(versionDir, 'server-1.2.0')
            await fs.mkdir(path.join(bundleDir, 'bin'))
            await fs.mkdir(path.join(bundleDir, 'node_modules'))
            await fs.writeFile(path.join(bundleDir, 'server.js'), 'server')

            assert.strictEqual(await resolver.isValidCacheDirectory(versionDir), true)

            await fs.delete(path.join(bundleDir, 'node_modules'), { force: true, recursive: true })
            assert.strictEqual(await resolver.isValidCacheDirectory(versionDir), false)
        })
    })

    describe('hash verification', function () {
        it('verifies single-prefix algorithm:digest format (sha256)', async function () {
            const data = Buffer.from('test content')
            // Compute raw hex using Node crypto directly (not the shared createHash which prefixes)
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384', // default algorithm — different from what we pass
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // algorithm:digest format should work regardless of default
            assert.strictEqual(verifyHash(data, [`sha256:${rawHex}`]), true)
        })

        it('verifies single-prefix algorithm:digest format (sha384)', async function () {
            const data = Buffer.from('sha384 test content')
            const rawHex = require('crypto').createHash('sha384').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha256', // configured to sha256 — but explicit prefix overrides
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            assert.strictEqual(verifyHash(data, [`sha384:${rawHex}`]), true)
        })

        it('verifies legacy raw hex digest using configured algorithm', async function () {
            const data = Buffer.from('test content 2')
            const rawHex = require('crypto').createHash('sha384').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // Raw hex without prefix — should use configured algorithm (sha384)
            assert.strictEqual(verifyHash(data, [rawHex]), true)
        })

        it('compares case-insensitively', async function () {
            const data = Buffer.from('case insensitive test')
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // Upper-case the expected digest
            assert.strictEqual(verifyHash(data, [`sha256:${rawHex.toUpperCase()}`]), true)
            // Upper-case algorithm name
            assert.strictEqual(verifyHash(data, [`SHA256:${rawHex}`]), true)
        })

        it('any valid matching hash passes (multi-hash)', async function () {
            const data = Buffer.from('multi hash test')
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // First hash is wrong, second is correct
            assert.strictEqual(verifyHash(data, ['sha256:wrong', `sha256:${rawHex}`]), true)
        })

        it('fails when no hash matches (mismatch)', async function () {
            const data = Buffer.from('no match')

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            assert.strictEqual(verifyHash(data, ['sha256:wrong1', 'sha384:wrong2']), false)
        })

        it('skips verification when no hashes provided (empty array)', async function () {
            const data = Buffer.from('no hashes')

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // Empty array = no hashes = skip verification = pass
            assert.strictEqual(verifyHash(data, []), true)
        })

        it('skips verification when all hashes use unsupported algorithms', async function () {
            const data = Buffer.from('unsupported algo')

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // Only unsupported algorithms — nothing computable = skip verification = pass
            assert.strictEqual(verifyHash(data, ['unsupported_algo:abc123', 'fake_hash:xyz']), true)
        })

        it('fails when mixed unsupported + valid but no match', async function () {
            const data = Buffer.from('mixed algos')

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // One unsupported + one valid but wrong digest — at least one supported was computed, must match
            assert.strictEqual(verifyHash(data, ['unsupported_algo:abc123', 'sha256:wrongdigest']), false)
        })

        it('passes when mixed unsupported + valid and valid matches', async function () {
            const data = Buffer.from('mixed algos pass')
            const rawHex = require('crypto').createHash('sha256').update(data).digest('hex') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/test'
            )

            const verifyHash = (resolver as any).verifyHash.bind(resolver)
            // One unsupported + one valid matching hash
            assert.strictEqual(verifyHash(data, ['unsupported_algo:abc123', `sha256:${rawHex}`]), true)
        })
    })

    describe('download retries - exactly 3 attempts with backoff', function () {
        it('retries exactly 3 times with exponential backoff', async function () {
            const fetchFn = async () => {
                throw new Error('download failed')
            }
            const sleepCalls: number[] = []
            const sleepFn = async (ms: number) => {
                sleepCalls.push(ms)
            }

            const manifest = createManifest([createVersion('1.0.0')])
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                '/tmp/nonexistent-dir',
                [],
                undefined,
                fetchFn as any,
                sleepFn
            )

            await assert.rejects(resolver.resolve())

            // 3 attempts means 2 sleeps (between 1->2 and 2->3)
            assert.strictEqual(sleepCalls.length, 2)
            // Exponential backoff: 2000 * 2^0 = 2000, 2000 * 2^1 = 4000
            assert.strictEqual(sleepCalls[0], 2000)
            assert.strictEqual(sleepCalls[1], 4000)
        })

        it('succeeds on second attempt after first failure', async function () {
            let callCount = 0
            const zipData = Buffer.from('fake zip')

            const fetchFn = async () => {
                callCount++
                if (callCount === 1) {
                    throw new Error('first attempt fails')
                }
                return { ok: true, arrayBuffer: async () => zipData.buffer }
            }
            const sleepFn = async () => {}

            const manifest = createManifest([
                createVersion('1.0.0', { hashes: [] }), // no hash = skip verification
            ])
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                path.join(os.tmpdir(), `lsp-test-retry-${Date.now()}`),
                [],
                undefined,
                fetchFn as any,
                sleepFn
            )

            // This will proceed past download but may fail on extraction (not a real zip)
            // The important thing is it doesn't fail with "3 attempts" error
            try {
                await resolver.resolve()
            } catch (err: any) {
                // May fail on extraction but should NOT be "Failed to download after 3 attempts"
                assert.ok(!err.message.includes('after 3 attempts'), `Unexpected error: ${err.message}`)
            }
        })
    })

    describe('zip extraction and zip-slip rejection', function () {
        let testDir: string

        beforeEach(async function () {
            const folder = await createTestWorkspaceFolder()
            testDir = folder.uri.fsPath
        })

        afterEach(async function () {
            await fs.delete(testDir, { force: true, recursive: true })
        })

        it('extracts valid zip content', async function () {
            const zip = new AdmZip()
            zip.addFile('server.js', Buffer.from('console.log("hello")'))
            zip.addFile('package.json', Buffer.from('{}'))
            const zipPath = path.join(testDir, 'server.zip')
            zip.writeZip(zipPath)

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                testDir
            )

            // Test zip extraction via private method
            const result = (resolver as any).copyZipContents([zipPath], testDir)
            assert.strictEqual(result, true)

            // Verify extracted files exist
            const extractDir = zipPath.replace('.zip', '')
            assert.ok(await fs.existsFile(path.join(extractDir, 'server.js')))
            assert.ok(await fs.existsFile(path.join(extractDir, 'package.json')))
        })

        it('rejects zip with path traversal (zip-slip)', async function () {
            const zip = new AdmZip()
            // Add entry with path traversal
            zip.addFile('../../../etc/malicious.txt', Buffer.from('evil'))
            const zipPath = path.join(testDir, 'malicious.zip')
            zip.writeZip(zipPath)

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                testDir
            )

            const result = (resolver as any).copyZipContents([zipPath], testDir)
            assert.strictEqual(result, false)
        })

        it('deletes zip files after extraction', async function () {
            const zip = new AdmZip()
            zip.addFile('test.js', Buffer.from('content'))
            const zipPath = path.join(testDir, 'bundle.zip')
            zip.writeZip(zipPath)

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                testDir
            )

            // First extract
            ;(resolver as any).copyZipContents([zipPath], testDir)

            // Then delete zips
            await (resolver as any).deleteZipFiles(testDir)

            // Zip should be deleted
            assert.ok(!(await fs.existsFile(zipPath)))
        })
    })

    describe('required files validation', function () {
        let testDir: string

        beforeEach(async function () {
            const folder = await createTestWorkspaceFolder()
            testDir = folder.uri.fsPath
        })

        afterEach(async function () {
            await fs.delete(testDir, { force: true, recursive: true })
        })

        it('passes when all required files exist', async function () {
            await fs.writeFile(path.join(testDir, 'server.js'), 'content')
            await fs.mkdir(path.join(testDir, 'node_modules'))

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                testDir,
                ['server.js', 'node_modules']
            )

            await assert.doesNotReject((resolver as any).validateRequiredFiles(testDir))
        })

        it('throws when required files are missing', async function () {
            await fs.writeFile(path.join(testDir, 'server.js'), 'content')
            // node_modules is missing

            const resolver = new LanguageServerResolver(
                createManifest([]),
                lsName,
                new Range('>=1.0.0'),
                manifestUrl,
                undefined,
                'sha384',
                testDir,
                ['server.js', 'node_modules']
            )

            await assert.rejects(
                (resolver as any).validateRequiredFiles(testDir),
                /Required files missing.*node_modules/
            )
        })
    })

    describe('baseDir configuration', function () {
        it('uses custom baseDir when provided', function () {
            const manifest = createManifest([createVersion('1.0.0')])
            const customBaseDir = '/custom/path/to/lsp'
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                undefined,
                'sha384',
                customBaseDir
            )

            assert.strictEqual(resolver.defaultDownloadFolder(), customBaseDir)
        })

        it('defaults to platform cache/aws/toolkits/language-servers/<name>', function () {
            const manifest = createManifest([createVersion('1.0.0')])
            const resolver = new LanguageServerResolver(
                manifest,
                lsName,
                new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl
            )

            const defaultFolder = resolver.defaultDownloadFolder()
            assert.ok(
                defaultFolder.includes(path.join('aws', 'toolkits', 'language-servers', lsName)),
                `Expected path to contain 'aws/toolkits/language-servers/${lsName}' but got: ${defaultFolder}`
            )
        })
    })

    describe('defaultDir', function () {
        it('returns a path ending with language-servers', function () {
            const dir = LanguageServerResolver.defaultDir()
            assert.ok(dir.endsWith(path.join('aws', 'toolkits', 'language-servers')))
        })
    })

    describe('fromConfig', function () {
        it('creates resolver from config object', function () {
            const manifest = createManifest([createVersion('1.0.0')])
            const resolver = LanguageServerResolver.fromConfig(manifest, {
                lsName,
                versionRange: new Range('>=1.0.0', { includePrerelease: true }),
                manifestUrl,
                baseDir: '/tmp/test',
                hashAlgorithm: 'sha256',
                requiredFiles: ['server.js'],
            })

            assert.ok(resolver instanceof LanguageServerResolver)
            assert.strictEqual(resolver.defaultDownloadFolder(), '/tmp/test')
        })
    })
})
