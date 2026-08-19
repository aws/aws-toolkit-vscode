/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { LspVersion } from '../types'
import { fs } from '../../../shared/fs/fs'
import { partition } from '../../../shared/utilities/tsUtils'
import { parse, SemVer } from 'semver'

export async function getDownloadedVersions(installLocation: string) {
    return (await fs.readdir(installLocation)).filter((x) => parse(x[0]) !== null).map(([f, _], __) => f)
}

function isDelisted(manifestVersions: LspVersion[], targetVersion: string): boolean {
    return manifestVersions.find((v) => v.serverVersion === targetVersion)?.isDelisted ?? false
}

/**
 * Callback that determines whether a cached version directory is valid.
 * Receives the full path to the version directory.
 * Default: directory exists and is non-empty.
 */
export type CacheValidator = (versionDir: string) => Promise<boolean>

async function defaultCacheValidator(versionDir: string): Promise<boolean> {
    try {
        if (!(await fs.existsDir(versionDir))) {
            return false
        }
        const entries = await fs.readdir(versionDir)
        return entries.length > 0
    } catch {
        return false
    }
}

/**
 * Delete all delisted versions and retain:
 * 1. The current (latestInstalledVersion) — always kept
 * 2. The highest VALID fallback version (non-delisted, parseable semver, passes validator)
 *
 * Everything else is deleted.
 *
 * @param latestInstalledVersion The version that was just installed/is currently active
 * @param manifestVersions The versions list from the manifest (for delisted checks)
 * @param downloadDirectory The parent directory containing version subdirectories
 * @param validator Optional callback for cache directory validation; defaults to non-empty check
 * @returns Array of deleted version strings
 */
export async function cleanLspDownloads(
    latestInstalledVersion: string,
    manifestVersions: LspVersion[],
    downloadDirectory: string,
    validator?: CacheValidator
): Promise<string[]> {
    const validate = validator ?? defaultCacheValidator
    const downloadedVersions = await getDownloadedVersions(downloadDirectory)
    const [delistedVersions, remainingVersions] = partition(downloadedVersions, (v: string) =>
        isDelisted(manifestVersions, v)
    )
    const deletedVersions: string[] = []

    for (const v of delistedVersions) {
        await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
        deletedVersions.push(v)
    }

    if (remainingVersions.length <= 1) {
        return deletedVersions
    }

    // Find the highest VALID fallback (not the current version, passes validation)
    const candidateFallbacks = remainingVersions
        .filter((v) => v !== latestInstalledVersion)
        .map((v) => ({ version: v, semver: parse(v) }))
        .filter((v): v is { version: string; semver: SemVer } => v.semver !== null)

    candidateFallbacks.sort((a, b) => b.semver.compare(a.semver))

    let highestValidFallback: string | undefined
    for (const candidate of candidateFallbacks) {
        if (await validate(path.join(downloadDirectory, candidate.version))) {
            highestValidFallback = candidate.version
            break
        }
    }

    // Retain set: current + highest valid fallback
    const retainSet = new Set<string>([latestInstalledVersion])
    if (highestValidFallback) {
        retainSet.add(highestValidFallback)
    }

    for (const v of remainingVersions) {
        if (!retainSet.has(v)) {
            await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
            deletedVersions.push(v)
        }
    }

    return deletedVersions
}
