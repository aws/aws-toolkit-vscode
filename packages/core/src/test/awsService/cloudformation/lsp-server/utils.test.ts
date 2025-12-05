/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import {
    addWindows,
    dedupeAndGetLatestVersions,
    extractPlatformAndArch,
    useOldLinuxVersion,
    CfnTarget,
} from '../../../../awsService/cloudformation/lsp-server/utils'
import { CLibCheck } from '../../../../awsService/cloudformation/lsp-server/CLibCheck'
import { LspVersion } from '../../../../shared/lsp/types'

describe('addWindows', () => {
    it('adds windows target when win32 exists and windows does not', () => {
        const targets: CfnTarget[] = [
            { platform: 'darwin', arch: 'arm64', contents: [] },
            { platform: 'linux', arch: 'x64', contents: [] },
            { platform: 'win32', arch: 'x64', contents: [] },
        ]

        const result = addWindows(targets)

        assert.strictEqual(result.length, 4)
        assert.ok(result.some((t) => t.platform === 'windows' && t.arch === 'x64'))
    })

    it('does not add windows target when windows already exists', () => {
        const targets: CfnTarget[] = [
            { platform: 'darwin', arch: 'arm64', contents: [] },
            { platform: 'win32', arch: 'x64', contents: [] },
            { platform: 'windows', arch: 'x64', contents: [] },
        ]

        const result = addWindows(targets)

        assert.strictEqual(result.length, 3)
    })

    it('does not add windows target when no win32 exists', () => {
        const targets: CfnTarget[] = [
            { platform: 'darwin', arch: 'arm64', contents: [] },
            { platform: 'linux', arch: 'x64', contents: [] },
        ]

        const result = addWindows(targets)

        assert.strictEqual(result.length, 2)
    })

    it('adds windows for multiple win32 architectures', () => {
        const targets: CfnTarget[] = [
            { platform: 'win32', arch: 'x64', contents: [] },
            { platform: 'win32', arch: 'arm64', contents: [] },
        ]

        const result = addWindows(targets)

        assert.strictEqual(result.length, 4)
        assert.strictEqual(result.filter((t) => t.platform === 'windows' && t.arch === 'x64').length, 1)
        assert.strictEqual(result.filter((t) => t.platform === 'windows' && t.arch === 'arm64').length, 1)
    })
})

describe('extractPlatformAndArch', () => {
    it('extracts platform, arch, and nodejs from standard filename', () => {
        const result = extractPlatformAndArch('cloudformation-languageserver-1.2.0-beta-darwin-arm64-node22.zip')

        assert.strictEqual(result.platform, 'darwin')
        assert.strictEqual(result.arch, 'arm64')
        assert.strictEqual(result.nodejs, '22')
    })

    it('extracts linux platform with x64 arch', () => {
        const result = extractPlatformAndArch('cloudformation-languageserver-1.2.0-beta-linux-x64-node22.zip')

        assert.strictEqual(result.platform, 'linux')
        assert.strictEqual(result.arch, 'x64')
        assert.strictEqual(result.nodejs, '22')
    })

    it('extracts linuxglib2.28 platform', () => {
        const result = extractPlatformAndArch('cloudformation-languageserver-1.2.0-beta-linuxglib2.28-arm64-node18.zip')

        assert.strictEqual(result.platform, 'linuxglib2.28')
        assert.strictEqual(result.arch, 'arm64')
        assert.strictEqual(result.nodejs, '18')
    })

    it('extracts win32 platform', () => {
        const result = extractPlatformAndArch('cloudformation-languageserver-1.2.0-beta-win32-x64-node22.zip')

        assert.strictEqual(result.platform, 'win32')
        assert.strictEqual(result.arch, 'x64')
        assert.strictEqual(result.nodejs, '22')
    })

    it('handles filename without node version', () => {
        const result = extractPlatformAndArch('cloudformation-languageserver-1.1.0-darwin-arm64.zip')

        assert.strictEqual(result.platform, 'darwin')
        assert.strictEqual(result.arch, 'arm64')
        assert.strictEqual(result.nodejs, undefined)
    })

    it('handles alpha version with timestamp', () => {
        const result = extractPlatformAndArch(
            'cloudformation-languageserver-1.2.0-202512020323-alpha-darwin-arm64-node22.zip'
        )

        assert.strictEqual(result.platform, 'darwin')
        assert.strictEqual(result.arch, 'arm64')
        assert.strictEqual(result.nodejs, '22')
    })

    it('throws error for invalid filename', () => {
        assert.throws(() => extractPlatformAndArch('invalid-file.zip'), /Could not extract platform/)
    })

    it('throws error for unsupported architecture', () => {
        assert.throws(
            () => extractPlatformAndArch('cloudformation-languageserver-1.0.0-darwin-arm32-node22.zip'),
            /Could not extract platform/
        )
    })
})

describe('useOldLinuxVersion', () => {
    let sandbox: sinon.SinonSandbox
    let originalPlatform: PropertyDescriptor | undefined

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    })

    afterEach(() => {
        sandbox.restore()
        if (originalPlatform) {
            Object.defineProperty(process, 'platform', originalPlatform)
        }
        delete process.env.SNAP
    })

    it('returns false on non-linux platforms', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })

        assert.strictEqual(useOldLinuxVersion(), false)
    })

    it('returns true in SNAP environment on linux', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
        process.env.SNAP = '/snap/something'

        assert.strictEqual(useOldLinuxVersion(), true)
    })

    it('returns false when GLIBCXX version cannot be determined', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
        sandbox.stub(CLibCheck, 'getGLibCXXVersions').returns({ maxFound: undefined, allAvailable: [] })

        assert.strictEqual(useOldLinuxVersion(), false)
    })

    it('returns true when GLIBCXX version is older than 3.4.29', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
        sandbox.stub(CLibCheck, 'getGLibCXXVersions').returns({ maxFound: '3.4.28', allAvailable: ['3.4.28'] })

        assert.strictEqual(useOldLinuxVersion(), true)
    })

    it('returns false when GLIBCXX version is 3.4.29', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
        sandbox.stub(CLibCheck, 'getGLibCXXVersions').returns({ maxFound: '3.4.29', allAvailable: ['3.4.29'] })

        assert.strictEqual(useOldLinuxVersion(), false)
    })

    it('returns false when GLIBCXX version is newer than 3.4.29', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
        sandbox.stub(CLibCheck, 'getGLibCXXVersions').returns({ maxFound: '3.4.32', allAvailable: ['3.4.32'] })

        assert.strictEqual(useOldLinuxVersion(), false)
    })
})

describe('dedupeAndGetLatestVersions', () => {
    for (const prefix of ['v', '']) {
        it(`handles versions with timestamp: ${prefix}`, () => {
            const result = dedupeAndGetLatestVersions(
                generateLspVersion(['0.0.1-2020', '0.0.2-2024', '0.0.3-2026', '0.0.2-2025', '0.0.3-2030'], prefix)
            )

            assert.strictEqual(result.length, 3)
            assert.strictEqual(result[0].serverVersion, '0.0.3-2030')
            assert.strictEqual(result[1].serverVersion, '0.0.2-2025')
            assert.strictEqual(result[2].serverVersion, '0.0.1-2020')
        })

        it('handles versions with timestamp and environment', () => {
            const result = dedupeAndGetLatestVersions(
                generateLspVersion(
                    ['0.0.1-2020-alpha', '0.0.2-2024-beta', '0.0.3-2026-alpha', '0.0.2-2025-prod', '0.0.3-2030-beta'],
                    prefix
                )
            )

            assert.strictEqual(result.length, 3)
            assert.strictEqual(result[0].serverVersion, '0.0.3-2030-beta')
            assert.strictEqual(result[1].serverVersion, '0.0.2-2025-prod')
            assert.strictEqual(result[2].serverVersion, '0.0.1-2020-alpha')
        })
    }

    function generateLspVersion(versions: string[], prefix: string = ''): LspVersion[] {
        return versions.map((version) => {
            return { serverVersion: `${prefix}${version}`, targets: [], isDelisted: false }
        })
    }
})
