/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { LspVersion } from '../types'
import { fs } from '../../../shared/fs/fs'
import { partition } from '../../../shared/utilities/tsUtils'
import { sort } from 'semver'

async function getDownloadedVersions(installLocation: string) {
    return (await fs.readdir(installLocation)).map(([f, _], __) => f)
}

function isDelisted(manifestVersions: LspVersion[], targetVersion: string): boolean {
    return manifestVersions.find((v) => v.serverVersion === targetVersion)?.isDelisted ?? false
}

/**
 * Delete all delisted versions and keep the two newest versions that remain
 * @param manifest
 * @param downloadDirectory
 */
export async function cleanUpLSPDownloads(manifestVersions: LspVersion[], downloadDirectory: string): Promise<void> {
    const downloadedVersions = await getDownloadedVersions(downloadDirectory)
    const [delistedVersions, remainingVersions] = partition(downloadedVersions, (v: string) =>
        isDelisted(manifestVersions, v)
    )
    for (const v of delistedVersions) {
        await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
    }

    if (remainingVersions.length <= 2) {
        return
    }

    for (const v of sort(remainingVersions).slice(0, -2)) {
        await fs.delete(path.join(downloadDirectory, v), { force: true, recursive: true })
    }
}
