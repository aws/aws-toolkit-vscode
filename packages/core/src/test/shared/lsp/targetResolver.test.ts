/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import {
    defaultTargetArch,
    defaultTargetPlatformResolver,
    findCompatibleTarget,
    getMaxGlibcxxVersion,
    maxGlibcxxVersion,
    parseLibStdCppFromLdconfig,
    useLegacyLinux,
    LinuxProbe,
} from '../../../shared/lsp/utils/targetResolver'
import { LspVersion } from '../../../shared/lsp/types'

describe('targetResolver', function () {
    describe('defaultTargetArch', function () {
        it('maps arm and arm64 to arm64', function () {
            assert.strictEqual(defaultTargetArch('arm'), 'arm64')
            assert.strictEqual(defaultTargetArch('arm64'), 'arm64')
        })

        it('maps every other Node architecture to x64', function () {
            for (const arch of ['x64', 'ia32', 'ppc64', 's390x', 'mips', 'mipsel', 'riscv64', 'loong64']) {
                assert.strictEqual(defaultTargetArch(arch), 'x64', `${arch} should map to x64`)
            }
        })

        it('defaults to the current process architecture', function () {
            const expected = process.arch === 'arm' || process.arch === 'arm64' ? 'arm64' : 'x64'
            assert.strictEqual(defaultTargetArch(), expected)
        })
    })

    describe('defaultTargetPlatformResolver', function () {
        it('returns process.platform and the mapped target arch', function () {
            const result = defaultTargetPlatformResolver()
            // On non-linux systems, should return process.platform directly
            if (process.platform !== 'linux') {
                assert.strictEqual(result.platform, process.platform)
            }
            assert.strictEqual(result.arch, defaultTargetArch(process.arch))
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

describe('parseLibStdCppFromLdconfig', function () {
    it('extracts the resolved path reported after "=>"', function () {
        const out = [
            '\tlibc.so.6 (libc6,x86-64) => /lib/x86_64-linux-gnu/libc.so.6',
            '\tlibstdc++.so.6 (libc6,x86-64) => /usr/lib/x86_64-linux-gnu/libstdc++.so.6',
        ].join('\n')
        assert.strictEqual(parseLibStdCppFromLdconfig(out), '/usr/lib/x86_64-linux-gnu/libstdc++.so.6')
    })

    it('returns undefined when libstdc++ is not listed', function () {
        assert.strictEqual(parseLibStdCppFromLdconfig('\tlibc.so.6 (libc6,x86-64) => /lib/libc.so.6'), undefined)
    })
})

describe('maxGlibcxxVersion', function () {
    it('returns the highest version regardless of order', function () {
        assert.strictEqual(maxGlibcxxVersion('GLIBCXX_3.4.9\nGLIBCXX_3.4.29\nGLIBCXX_3.4.21'), '3.4.29')
    })

    it('coerces two-component versions to semver', function () {
        assert.strictEqual(maxGlibcxxVersion('GLIBCXX_3.4'), '3.4.0')
    })

    it('ignores non-version GLIBCXX symbols', function () {
        assert.strictEqual(maxGlibcxxVersion('GLIBCXX_DEBUG_MESSAGE_LENGTH\nCXXABI_1.3'), undefined)
    })

    it('returns undefined when there are no GLIBCXX symbols', function () {
        assert.strictEqual(maxGlibcxxVersion('nothing to see here'), undefined)
    })
})

describe('getMaxGlibcxxVersion (libstdc++ discovery)', function () {
    function fakeProbe(overrides: Partial<LinuxProbe>): LinuxProbe {
        return {
            run: () => {
                throw new Error('unexpected run')
            },
            exists: () => false,
            readBytes: () => {
                throw new Error('unexpected readBytes')
            },
            ...overrides,
        }
    }

    it('reads GLIBCXX versions from strings output without a shell pipeline', function () {
        const lib = '/usr/lib/x86_64-linux-gnu/libstdc++.so.6'
        const probe = fakeProbe({
            run: (cmd, args) => {
                if (cmd === '/sbin/ldconfig') {
                    assert.deepStrictEqual(args, ['-p'])
                    return `\tlibstdc++.so.6 (libc6,x86-64) => ${lib}\n`
                }
                if (cmd === 'strings') {
                    assert.deepStrictEqual(args, [lib], 'strings must be invoked with the lib path only (no shell)')
                    return ['GLIBCXX_3.4.20', 'GLIBCXX_3.4.29', 'GLIBCXX_3.4.9'].join('\n')
                }
                throw new Error(`unexpected command ${cmd}`)
            },
        })
        assert.strictEqual(getMaxGlibcxxVersion(probe), '3.4.29')
    })

    it('falls back to reading the binary as ISO-8859-1 when strings fails', function () {
        const probe = fakeProbe({
            run: (cmd) => {
                if (cmd === '/sbin/ldconfig') {
                    return 'libstdc++.so.6 (libc6,x86-64) => /lib/libstdc++.so.6\n'
                }
                throw new Error('strings: command not found')
            },
            readBytes: () => Buffer.from('\x00\x7fGLIBCXX_3.4.30\x00GLIBCXX_3.4.21\x00', 'latin1'),
        })
        assert.strictEqual(getMaxGlibcxxVersion(probe), '3.4.30')
    })

    it('falls back to common paths when ldconfig fails, then reads versions', function () {
        const commonPath = '/usr/lib64/libstdc++.so.6'
        const probe = fakeProbe({
            run: (cmd, args) => {
                if (cmd === '/sbin/ldconfig') {
                    throw new Error('ldconfig: not found')
                }
                if (cmd === 'strings') {
                    assert.deepStrictEqual(args, [commonPath])
                    return 'GLIBCXX_3.4.19\nGLIBCXX_3.4.25\n'
                }
                throw new Error(`unexpected command ${cmd}`)
            },
            exists: (p) => p === commonPath,
        })
        assert.strictEqual(getMaxGlibcxxVersion(probe), '3.4.25')
    })

    it('returns undefined when libstdc++ cannot be located at all', function () {
        const probe = fakeProbe({
            run: () => {
                throw new Error('no ldconfig')
            },
            exists: () => false,
        })
        assert.strictEqual(getMaxGlibcxxVersion(probe), undefined)
    })
})

describe('useLegacyLinux', function () {
    let sandbox: sinon.SinonSandbox
    const originalSnap = process.env.SNAP

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        delete process.env.SNAP
    })

    afterEach(function () {
        sandbox.restore()
        if (originalSnap === undefined) {
            delete process.env.SNAP
        } else {
            process.env.SNAP = originalSnap
        }
    })

    function probeReportingGlibcxx(version: string): LinuxProbe {
        return {
            run: (cmd) =>
                cmd === '/sbin/ldconfig'
                    ? 'libstdc++.so.6 (libc6,x86-64) => /usr/lib/libstdc++.so.6\n'
                    : `GLIBCXX_${version}\n`,
            exists: () => true,
            readBytes: () => Buffer.alloc(0),
        }
    }

    const failingProbe: LinuxProbe = {
        run: () => assert.fail('must not probe'),
        exists: () => assert.fail('must not probe'),
        readBytes: () => assert.fail('must not probe'),
    }

    it('returns false on non-Linux platforms', function () {
        sandbox.stub(process, 'platform').value('darwin')
        assert.strictEqual(useLegacyLinux(failingProbe), false)
    })

    it('treats a Snap environment as legacy without probing', function () {
        sandbox.stub(process, 'platform').value('linux')
        process.env.SNAP = '/snap/code/current'
        assert.strictEqual(useLegacyLinux(failingProbe), true)
    })

    it('is legacy when GLIBCXX is below the 3.4.29 threshold', function () {
        sandbox.stub(process, 'platform').value('linux')
        assert.strictEqual(useLegacyLinux(probeReportingGlibcxx('3.4.28')), true)
    })

    it('is not legacy at or above the 3.4.29 threshold', function () {
        sandbox.stub(process, 'platform').value('linux')
        assert.strictEqual(useLegacyLinux(probeReportingGlibcxx('3.4.29')), false)
        assert.strictEqual(useLegacyLinux(probeReportingGlibcxx('3.4.30')), false)
    })

    it('is not legacy when the GLIBCXX version cannot be determined', function () {
        sandbox.stub(process, 'platform').value('linux')
        const probe: LinuxProbe = {
            run: () => {
                throw new Error('nope')
            },
            exists: () => false,
            readBytes: () => {
                throw new Error('nope')
            },
        }
        assert.strictEqual(useLegacyLinux(probe), false)
    })
})
