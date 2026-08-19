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

/**
 * Default target platform resolver.
 *
 * Uses Node's `process.platform` directly (e.g. `win32`, `linux`, `darwin`)
 * instead of the legacy `windows` mapping.
 *
 * On Linux, detects if the environment has old GLIBCXX (< 3.4.29) or is a Snap
 * and returns `linuxglib2.28` for legacy compatibility.
 */
export function defaultTargetPlatformResolver(): TargetPlatform {
    const arch = process.arch

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

/**
 * Determines if the current Linux environment requires legacy glib builds.
 * Returns true if:
 * - Running inside a Snap container, OR
 * - GLIBCXX max version is below 3.4.29
 */
export function useLegacyLinux(): boolean {
    if (process.platform !== 'linux') {
        return false
    }

    if (process.env.SNAP !== undefined) {
        return true
    }

    const maxGlibcxx = getMaxGlibcxxVersion()
    if (!maxGlibcxx) {
        return false
    }

    return semver.lt(maxGlibcxx, '3.4.29')
}

/**
 * Gets the maximum GLIBCXX version available on the system.
 * Returns undefined if detection fails or not on Linux.
 */
function getMaxGlibcxxVersion(): string | undefined {
    try {
        // Lazy-require to avoid importing node:child_process in all environments
        const { execSync } = require('child_process') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports
        const { existsSync } = require('fs') // eslint-disable-line no-restricted-imports, @typescript-eslint/no-require-imports

        const libPath = findLibStdCpp(execSync, existsSync)
        if (!libPath) {
            return undefined
        }

        const output: string = execSync(`strings "${libPath}" | grep GLIBCXX`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 10000,
        })

        const versions = output
            .trim()
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => /^GLIBCXX_\d/.test(line))
            .map((line) => {
                const match = line.match(/^GLIBCXX_(\d+\.\d+(?:\.\d+)?)/)
                return match ? match[1] : undefined
            })
            .filter((v): v is string => v !== undefined)
            .map((v) => semver.coerce(v))
            .filter((v): v is semver.SemVer => v !== null)
            .sort(semver.compare)

        return versions.length > 0 ? versions[versions.length - 1].version : undefined
    } catch {
        return undefined
    }
}

function findLibStdCpp(
    execSync: (cmd: string, opts: object) => string,
    existsSync: (p: string) => boolean
): string | undefined {
    try {
        const ldconfig = execSync('/sbin/ldconfig -p | grep libstdc++.so.6', { encoding: 'utf8', timeout: 5000 })
        const match = ldconfig.match(/=>\s+(.+)$/m)
        if (match?.[1]) {
            return match[1].trim()
        }
    } catch {
        /* ignore */
    }

    const commonPaths = [
        '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
        '/usr/lib64/libstdc++.so.6',
        '/usr/lib/libstdc++.so.6',
        '/lib/x86_64-linux-gnu/libstdc++.so.6',
    ]

    for (const p of commonPaths) {
        if (existsSync(p)) {
            return p
        }
    }

    return undefined
}
