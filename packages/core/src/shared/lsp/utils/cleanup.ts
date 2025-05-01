/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { LspVersion } from '../types'
import { fs } from '../../../shared/fs/fs'
import { partition } from '../../../shared/utilities/tsUtils'
import { parse, sort } from 'semver'

export async function getDownloadedVersions(installLocation: string) {
    return (await fs.readdir(installLocation)).filter((x) => parse(x[0]) !== null).map(([f, _], __) => f)
}

function isDelisted(manifestVersions: LspVersion[], targetVersion: string): boolean {
    return manifestVersions.find((v) => v.serverVersion === targetVersion)?.isDelisted ?? false
}

/**
 * Delete all delisted versions and keep the two newest versions that remain
 * @param manifestVersions
 * @param downloadDirectory
 * @returns array of deleted versions.
 */
export async function cleanLspDownloads(
    latestInstalledVersion: string,
    manifestVersions: LspVersion[],
    downloadDirectory: string
): Promise<string[]> {
    const downloadedVersions = await getDownloadedVersions(downloadDirectory)
    const [delistedVersions, remainingVersions] = partition(downloadedVersions, (v: string) =>
        isDelisted(manifestVersions, v)
    )
    const deletedVersions: string[] = []

    for (const v of delistedVersions) {
        await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
        deletedVersions.push(v)
    }

    if (remainingVersions.length <= 2) {
        return deletedVersions
    }

    for (const v of sort(remainingVersions).slice(0, -2)) {
        /**
         * When switching between different manifests, the following edge case can occur:
         * A newly downloaded version might chronologically be older than all previously downloaded versions,
         * even though it's marked as the latest version in its own manifest.
         * In such cases, we skip the cleanup process to preserve this version. Otherwise we will get an EPIPE error
         */
        if (v === latestInstalledVersion) {
            continue
        }
        await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
        deletedVersions.push(v)
    }

    return deletedVersions
}
