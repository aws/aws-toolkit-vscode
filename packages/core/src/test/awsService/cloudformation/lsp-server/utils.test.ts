/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import {
    useOldLinuxVersion,
    mapLegacyLinux,
    CfnLspVersion,
} from '../../../../awsService/cloudformation/lsp-server/utils'
import { CLibCheck } from '../../../../awsService/cloudformation/lsp-server/CLibCheck'

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

describe('mapLegacyLinux', () => {
    const darwinContent = { filename: 'darwin.zip', url: 'https://example.com/darwin.zip', hashes: ['abc'], bytes: 100 }
    const linuxContent = { filename: 'linux.zip', url: 'https://example.com/linux.zip', hashes: ['def'], bytes: 200 }
    const legacyContent = { filename: 'legacy.zip', url: 'https://example.com/legacy.zip', hashes: ['ghi'], bytes: 300 }
    const winContent = { filename: 'win.zip', url: 'https://example.com/win.zip', hashes: ['jkl'], bytes: 400 }

    it('remaps linuxglib2.28 to linux and removes original linux target', () => {
        const versions: CfnLspVersion[] = [
            {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    { platform: 'darwin', arch: 'arm64', contents: [darwinContent] },
                    { platform: 'linux', arch: 'x64', contents: [linuxContent] },
                    { platform: 'linuxglib2.28', arch: 'x64', contents: [legacyContent], nodejs: '18' },
                    { platform: 'win32', arch: 'x64', contents: [winContent] },
                ],
            },
        ]

        const result = mapLegacyLinux(versions)

        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].serverVersion, '1.0.0')
        assert.strictEqual(result[0].isDelisted, false)
        assert.strictEqual(result[0].targets.length, 3)
        assert.deepStrictEqual(result[0].targets[0], { platform: 'darwin', arch: 'arm64', contents: [darwinContent] })
        assert.deepStrictEqual(result[0].targets[1], {
            platform: 'linux',
            arch: 'x64',
            contents: [legacyContent],
            nodejs: '18',
        })
        assert.deepStrictEqual(result[0].targets[2], { platform: 'win32', arch: 'x64', contents: [winContent] })
    })

    it('returns version unchanged when no linuxglib2.28 target exists', () => {
        const versions: CfnLspVersion[] = [
            {
                serverVersion: '2.0.0',
                isDelisted: true,
                targets: [
                    { platform: 'darwin', arch: 'arm64', contents: [darwinContent] },
                    { platform: 'linux', arch: 'x64', contents: [linuxContent] },
                ],
            },
        ]

        const result = mapLegacyLinux(versions)

        assert.strictEqual(result.length, 1)
        assert.deepStrictEqual(result[0], versions[0])
    })

    it('handles multiple versions with mixed legacy targets', () => {
        const versions: CfnLspVersion[] = [
            {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    { platform: 'darwin', arch: 'arm64', contents: [] },
                    { platform: 'linuxglib2.28', arch: 'x64', contents: [legacyContent] },
                ],
            },
            {
                serverVersion: '2.0.0',
                isDelisted: false,
                targets: [{ platform: 'darwin', arch: 'arm64', contents: [] }],
            },
        ]

        const result = mapLegacyLinux(versions)

        assert.strictEqual(result.length, 2)
        assert.strictEqual(result[0].serverVersion, '1.0.0')
        assert.strictEqual(result[0].targets.length, 2)
        assert.deepStrictEqual(result[0].targets[1], { platform: 'linux', arch: 'x64', contents: [legacyContent] })
        assert.deepStrictEqual(result[1], versions[1])
    })

    it('handles empty versions array', () => {
        assert.deepStrictEqual(mapLegacyLinux([]), [])
    })
})
