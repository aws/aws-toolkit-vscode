/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import { getLogger } from '../../logger/logger'
import { LspVersion, Target } from '../types'

const logger = getLogger('lsp')

/**
 * Resolved target platform and architecture.
 */
export interface TargetPlatform {
    platform: string
    arch: string
}

/**
 * Function that resolves the target platform and architecture.
 * Can be overridden by clients for custom platform detection.
 */
export type TargetPlatformResolver = () => TargetPlatform

export function defaultTargetArch(nodeArch: string = process.arch): string {
    return nodeArch === 'arm' || nodeArch === 'arm64' ? 'arm64' : 'x64'
}

/**
 * Default target platform resolver.
 *
 * Uses Node's `process.platform` directly (e.g. `win32`, `linux`, `darwin`)
 * instead of the legacy `windows` mapping, and maps the architecture via {@link defaultTargetArch}.
 *
 * On Linux, detects if the environment has old GLIBCXX (< 3.4.29) or is a Snap
 * and returns `linuxglib2.28` for legacy compatibility.
 */
export function defaultTargetPlatformResolver(): TargetPlatform {
    const arch = defaultTargetArch()

    if (process.platform === 'linux' && useLegacyLinux()) {
        logger.info('Detected legacy Linux environment, using linuxglib2.28 platform')
        return { platform: 'linuxglib2.28', arch }
    }

    // Use process.platform directly — `win32` not `windows`
    return { platform: process.platform, arch }
}

/**
 * Finds the compatible target in a version's target list for the given platform/arch.
 * Returns undefined if no match is found.
 */
export function findCompatibleTarget(version: LspVersion, targetPlatform: TargetPlatform): Target | undefined {
    return version.targets.find((t: Target) => t.arch === targetPlatform.arch && t.platform === targetPlatform.platform)
}

const glibcxxThreshold = '3.4.29'

const libStdCppCommonPaths = [
    '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
    '/usr/lib64/libstdc++.so.6',
    '/usr/lib/libstdc++.so.6',
    '/lib/x86_64-linux-gnu/libstdc++.so.6',
]

export interface LinuxProbe {
    run(command: string, args: string[]): string
    exists(path: string): boolean
    readBytes(path: string): Buffer
}

function defaultLinuxProbe(): LinuxProbe {
    // Lazy-require to avoid importing node:child_process / node:fs in all environments (e.g. web).
    const { execFileSync } = require('child_process') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports
    const { existsSync, readFileSync } = require('fs') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports
    return {
        run: (command: string, args: string[]) =>
            execFileSync(command, args, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: command === '/sbin/ldconfig' ? 5000 : 10000,
                maxBuffer: 64 * 1024 * 1024,
            }),
        exists: (p: string) => existsSync(p),
        readBytes: (p: string) => readFileSync(p),
    }
}

/**
 * Determines if the current Linux environment requires legacy glib builds.
 * Returns true if:
 * - Running inside a Snap container, OR
 * - GLIBCXX max version is below 3.4.29
 */
export function useLegacyLinux(probe?: LinuxProbe): boolean {
    if (process.platform !== 'linux') {
        return false
    }

    if (process.env.SNAP !== undefined) {
        return true
    }

    const maxGlibcxx = getMaxGlibcxxVersion(probe ?? defaultLinuxProbe())
    if (!maxGlibcxx) {
        return false
    }

    return semver.lt(maxGlibcxx, glibcxxThreshold)
}

export function getMaxGlibcxxVersion(probe: LinuxProbe): string | undefined {
    const libPath = findLibStdCpp(probe)
    if (!libPath) {
        return undefined
    }
    return readGlibcxxVersions(libPath, probe)
}

function findLibStdCpp(probe: LinuxProbe): string | undefined {
    // Prefer the loader cache: `/sbin/ldconfig -p` invoked without a shell pipeline; parsing is in JS.
    try {
        const fromLdconfig = parseLibStdCppFromLdconfig(probe.run('/sbin/ldconfig', ['-p']))
        if (fromLdconfig) {
            return fromLdconfig
        }
    } catch {
        // ldconfig unavailable or failed; fall through to common paths.
    }

    return libStdCppCommonPaths.find((p) => probe.exists(p))
}

function readGlibcxxVersions(libPath: string, probe: LinuxProbe): string | undefined {
    // Prefer `strings <lib>` (no shell), parsing GLIBCXX versions in JS.
    try {
        const fromStrings = maxGlibcxxVersion(probe.run('strings', [libPath]))
        if (fromStrings) {
            return fromStrings
        }
    } catch {
        // strings unavailable or failed; fall through to reading the binary directly.
    }

    // Fallback: read the binary as ISO-8859-1 so every byte maps to a character, then regex it.
    try {
        return maxGlibcxxVersion(probe.readBytes(libPath).toString('latin1'))
    } catch {
        return undefined
    }
}

export function parseLibStdCppFromLdconfig(output: string): string | undefined {
    for (const line of output.split('\n')) {
        if (!line.includes('libstdc++.so.6')) {
            continue
        }
        const arrowIdx = line.indexOf('=>')
        if (arrowIdx >= 0) {
            const resolved = line.slice(arrowIdx + 2).trim()
            if (resolved) {
                return resolved
            }
        }
    }
    return undefined
}

export function maxGlibcxxVersion(text: string): string | undefined {
    const versions = [...text.matchAll(/GLIBCXX_(\d+\.\d+(?:\.\d+)?)/g)]
        .map((match) => semver.coerce(match[1]))
        .filter((v): v is semver.SemVer => v !== null)
        .sort(semver.compare)

    return versions.length > 0 ? versions[versions.length - 1].version : undefined
}
