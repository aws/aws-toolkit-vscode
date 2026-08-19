/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { defaultTargetPlatformResolver, findCompatibleTarget } from '../../../shared/lsp/utils/targetResolver'
import { LspVersion } from '../../../shared/lsp/types'

describe('targetResolver', function () {
    describe('defaultTargetPlatformResolver', function () {
        it('returns process.platform and process.arch', function () {
            const result = defaultTargetPlatformResolver()
            // On non-linux systems, should return process.platform directly
            if (process.platform !== 'linux') {
                assert.strictEqual(result.platform, process.platform)
            }
            assert.strictEqual(result.arch, process.arch)
        })

        it('returns win32 on Windows (not "windows")', function () {
            // This test validates the design decision:
            // The resolver uses Node's process.platform directly (win32)
            // rather than mapping to legacy 'windows' string
            const result = defaultTargetPlatformResolver()
            if (process.platform === 'win32') {
                assert.strictEqual(result.platform, 'win32')
                assert.notStrictEqual(result.platform, 'windows')
            }
        })
    })

    describe('findCompatibleTarget', function () {
        it('finds target matching platform and arch', function () {
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    { platform: 'darwin', arch: 'arm64', contents: [] },
                    { platform: 'linux', arch: 'x64', contents: [] },
                    { platform: 'win32', arch: 'x64', contents: [] },
                ],
            }

            const target = findCompatibleTarget(version, { platform: 'win32', arch: 'x64' })
            assert.ok(target)
            assert.strictEqual(target.platform, 'win32')
            assert.strictEqual(target.arch, 'x64')
        })

        it('returns undefined when no target matches', function () {
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [{ platform: 'darwin', arch: 'arm64', contents: [] }],
            }

            const target = findCompatibleTarget(version, { platform: 'win32', arch: 'x64' })
            assert.strictEqual(target, undefined)
        })

        it('matches linuxglib2.28 platform for legacy linux', function () {
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [
                    { platform: 'linux', arch: 'x64', contents: [] },
                    { platform: 'linuxglib2.28', arch: 'x64', contents: [] },
                ],
            }

            const target = findCompatibleTarget(version, { platform: 'linuxglib2.28', arch: 'x64' })
            assert.ok(target)
            assert.strictEqual(target.platform, 'linuxglib2.28')
        })

        it('supports custom platform/arch combinations', function () {
            const version: LspVersion = {
                serverVersion: '1.0.0',
                isDelisted: false,
                targets: [{ platform: 'custom-platform', arch: 'riscv64', contents: [] }],
            }

            const target = findCompatibleTarget(version, { platform: 'custom-platform', arch: 'riscv64' })
            assert.ok(target)
        })
    })
})

describe('telemetry initialization options', function () {
    /**
     * Helper that computes the clientId value that should be sent in initializationOptions.
     * This mirrors the logic in extension.ts.
     */
    function computeClientIdForInit(
        telemetryEnabled: boolean,
        clientId: string,
        isAnonymous: boolean
    ): string | undefined {
        return telemetryEnabled && !isAnonymous ? clientId : undefined
    }

    it('includes clientId when telemetry is enabled and clientId is non-anonymous', function () {
        const result = computeClientIdForInit(true, 'real-uuid-123', false)
        assert.strictEqual(result, 'real-uuid-123')
    })

    it('excludes clientId when telemetry is disabled', function () {
        const result = computeClientIdForInit(false, 'real-uuid-123', false)
        assert.strictEqual(result, undefined)
    })

    it('excludes clientId when clientId is anonymous', function () {
        const result = computeClientIdForInit(true, 'anonymous-id', true)
        assert.strictEqual(result, undefined)
    })

    it('excludes clientId when both disabled and anonymous', function () {
        const result = computeClientIdForInit(false, 'anonymous-id', true)
        assert.strictEqual(result, undefined)
    })

    it('telemetryEnabled is always included in init options', function () {
        // This test documents the requirement that telemetryEnabled must always be present
        // in the initialization options structure
        const initOptions = {
            aws: {
                telemetryEnabled: false,
                clientInfo: {
                    clientId: computeClientIdForInit(false, 'some-id', false),
                },
            },
        }
        assert.strictEqual(initOptions.aws.telemetryEnabled, false)
        assert.strictEqual(initOptions.aws.clientInfo.clientId, undefined)
    })
})
