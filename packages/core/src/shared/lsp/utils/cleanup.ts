/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { LspVersion } from '../types'
import { fs } from '../../../shared/fs/fs'
import { parse, sort } from 'semver'
import { InUseTracker } from './inUseTracker'

export async function getDownloadedVersions(installLocation: string) {
    return (await fs.readdir(installLocation)).filter((x) => parse(x[0]) !== null).map(([f, _], __) => f)
}

const inUseTracker = new InUseTracker()

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

async function sweepStaleTmpDirs(downloadDirectory: string): Promise<void> {
    try {
        const entries = await fs.readdir(downloadDirectory)
        for (const [name] of entries) {
            const match = /\.tmp\.(\d+)$/.exec(name)
            if (!match) {
                continue
            }
            const pid = parseInt(match[1], 10)
            if (!isNaN(pid) && !isPidAlive(pid)) {
                await fs.delete(path.join(downloadDirectory, name), { force: true, recursive: true }).catch(() => {})
            }
        }
    } catch {}
}

/**
 * Keep the current version and one highest fallback.
 * Skip versions that are currently in use by another IDE/session.
 * Remove everything else.
 */
export async function cleanLspDownloads(
    latestInstalledVersion: string,
    manifestVersions: LspVersion[],
    downloadDirectory: string
): Promise<string[]> {
    await sweepStaleTmpDirs(downloadDirectory)
    const downloadedVersions = await getDownloadedVersions(downloadDirectory)
    const deletedVersions: string[] = []

    const fallbackVersion = sort(
        downloadedVersions.filter((v) => parse(v) !== null && v !== latestInstalledVersion)
    ).reverse()[0]

    const keep = new Set([latestInstalledVersion, ...(fallbackVersion ? [fallbackVersion] : [])])

    for (const v of downloadedVersions) {
        if (keep.has(v)) {
            continue
        }
        const versionDir = path.join(downloadDirectory, v)
        inUseTracker.cleanStaleMarkers(versionDir)
        if (inUseTracker.isInUse(versionDir)) {
            continue
        }
        await fs.delete(versionDir, { force: true, recursive: true })
        deletedVersions.push(v)
    }

    return deletedVersions
}
