/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { FileType } from 'vscode'
import { fs } from '../../../shared/fs/fs'
import { parse, SemVer } from 'semver'

function isDirectoryEntry(filetype: FileType): boolean {
    return (filetype & FileType.Directory) !== 0
}

function isSymbolicLink(filetype: FileType): boolean {
    return (filetype & FileType.SymbolicLink) !== 0
}

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

export async function cleanLspDownloads(
    latestInstalledVersion: string,
    downloadDirectory: string,
    validator?: CacheValidator
): Promise<string[]> {
    const validate = validator ?? defaultCacheValidator
    const directories = (await fs.readdir(downloadDirectory)).filter(([, filetype]) => isDirectoryEntry(filetype))
    const deletedVersions: string[] = []

    const candidateFallbacks = directories
        .map(([name]) => name)
        .filter((name) => name !== latestInstalledVersion)
        .map((name) => ({ version: name, semver: parse(name) }))
        .filter((v): v is { version: string; semver: SemVer } => v.semver !== null)
        .sort((a, b) => b.semver.compare(a.semver))

    let highestValidFallback: string | undefined
    for (const candidate of candidateFallbacks) {
        if (await validate(path.join(downloadDirectory, candidate.version))) {
            highestValidFallback = candidate.version
            break
        }
    }

    const retainSet = new Set<string>([latestInstalledVersion])
    if (highestValidFallback) {
        retainSet.add(highestValidFallback)
    }

    for (const [name, filetype] of directories) {
        if (retainSet.has(name)) {
            continue
        }
        // A directory symlink is unlinked (recursive: false) so its target survives; a real directory
        // is removed recursively.
        await fs.delete(path.join(downloadDirectory, name), { force: true, recursive: !isSymbolicLink(filetype) })
        deletedVersions.push(name)
    }

    return deletedVersions
}
